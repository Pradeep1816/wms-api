import { MigrationInterface, QueryRunner } from 'typeorm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CustomerBalanceCalculationRepository } from '../customer/repositories/customer-balance-calculation.repository';

// Reviewed against smw_sep_11. Deliberately not a blanket reprice of historical
// invoices: payments, discounts and identities are revalidated on deployment.
const CASES = [
  {
    invoice: 1172723,
    line: 1199768,
    lesson: 5177994,
    customer: 3559,
    location: 9,
    old: 36.25,
    expected: 35.16,
    prepaid: 1.09,
  },
  {
    invoice: 1172740,
    line: 1199785,
    lesson: 5396492,
    customer: 13650,
    location: 9,
    old: 40,
    expected: 38,
    prepaid: 2,
  },
  {
    invoice: 1172433,
    line: 1199469,
    lesson: 5228336,
    customer: 14192,
    location: 16,
    old: 40,
    expected: 38.83,
    prepaid: 1.17,
  },
  {
    invoice: 1171295,
    line: 1198326,
    lesson: 5314621,
    customer: 13366,
    location: 16,
    old: 36.25,
    expected: 35.16,
    prepaid: 1.09,
  },
  {
    invoice: 1173301,
    line: 1200349,
    lesson: 5314622,
    customer: 13366,
    location: 16,
    old: 36.25,
    expected: 35.16,
    prepaid: 1.09,
  },
  {
    invoice: 1172443,
    line: 1199479,
    lesson: 5348507,
    customer: 14974,
    location: 16,
    old: 35.16,
    expected: 34.07,
    prepaid: 1.09,
  },
  {
    invoice: 1172856,
    line: 1199901,
    lesson: 5348508,
    customer: 14974,
    location: 16,
    old: 36.25,
    expected: 35.16,
    prepaid: 1.09,
  },
  {
    invoice: 1172939,
    line: 1199984,
    lesson: 5428471,
    customer: 14744,
    location: 18,
    old: 36.25,
    expected: 35.16,
    prepaid: 1.09,
  },
  {
    invoice: 1172940,
    line: 1199985,
    lesson: 5428472,
    customer: 14744,
    location: 18,
    old: 36.25,
    expected: 35.16,
    prepaid: 1.09,
  },
] as const;
const BACKUP = 'migration_prepaid_invoice_repair_backup';
const MUTABLE = ['invoice_line_item', 'invoice', 'customer_account'] as const;
type Row = Record<string, any>;
type Snapshot = Record<string, Row[]>;
type Change = {
  table: (typeof MUTABLE)[number];
  id: number;
  before: Row;
  after: Row;
};
const cents = (n: unknown) => Math.round(Number(n) * 100);
const decimal = (n: number) => (n / 100).toFixed(4);
function normalize(value: any): any {
  if (value instanceof Date)
    return value.toISOString().slice(0, 19).replace('T', ' ');
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, normalize(value[k])]),
    );
  return value;
}
const hash = (v: any) =>
  createHash('sha256')
    .update(JSON.stringify(normalize(v)))
    .digest('hex');
function fail(message: string): never {
  throw new Error(`Prepaid invoice repair refused: ${message}`);
}
const columnCache = new WeakMap<object, Map<string, Row[]>>();

async function readRows(
  q: Pick<QueryRunner, 'query'>,
  table: string,
  where: string,
  params: any[] = [],
) {
  if (!columnCache.has(q)) columnCache.set(q, new Map());
  const cache = columnCache.get(q)!;
  if (!cache.has(table))
    cache.set(table, await q.query(`SHOW COLUMNS FROM \`${table}\``));
  const columns = cache.get(table)!;
  const select = columns
    .map((c: any) => {
      assert.match(c.Field, /^[a-zA-Z0-9_]+$/);
      const name = `\`${c.Field}\``;
      const value = /^(date|time|decimal)/i.test(c.Type)
        ? `CAST(${name} AS CHAR)`
        : name;
      return `'${c.Field}',${value}`;
    })
    .join(',');
  const rows = await q.query(
    `SELECT JSON_OBJECT(${select}) AS rowSnapshot FROM \`${table}\` WHERE ${where} ORDER BY id`,
    params,
  );
  return rows.map((r: any) =>
    normalize(
      typeof r.rowSnapshot === 'string'
        ? JSON.parse(r.rowSnapshot)
        : r.rowSnapshot,
    ),
  );
}

async function inspect(
  q: Pick<QueryRunner, 'query' | 'connection' | 'manager'>,
): Promise<Snapshot> {
  const invoices = CASES.map((c) => c.invoice).join(',');
  const lessons = CASES.map((c) => c.lesson).join(',');
  const customers = [...new Set(CASES.map((c) => c.customer))].join(',');
  const sql: Record<string, string> = {
    invoice: `SELECT * FROM invoice WHERE id IN (${invoices}) ORDER BY id`,
    invoice_line_item: `SELECT * FROM invoice_line_item WHERE invoice_id IN (${invoices}) ORDER BY id`,
    invoice_line_item_discount: `SELECT d.* FROM invoice_line_item_discount d JOIN invoice_line_item l ON l.id=d.invoiceLineItemId WHERE l.invoice_id IN (${invoices}) ORDER BY d.id`,
    invoice_item_lesson: `SELECT x.* FROM invoice_item_lesson x JOIN invoice_line_item l ON l.id=x.invoiceLineItemId WHERE l.invoice_id IN (${invoices}) ORDER BY x.id`,
    invoice_payment: `SELECT * FROM invoice_payment WHERE invoice_id IN (${invoices}) ORDER BY id`,
    payment: `SELECT * FROM payment WHERE id IN (SELECT payment_id FROM invoice_payment WHERE invoice_id IN (${invoices})) OR id IN (SELECT paymentId FROM lesson_payment WHERE lessonId IN (${lessons})) ORDER BY id`,
    lesson: `SELECT * FROM lesson WHERE id IN (${lessons}) ORDER BY id`,
    private_lesson: `SELECT * FROM private_lesson WHERE lessonId IN (${lessons}) ORDER BY id`,
    lesson_discount: `SELECT * FROM lesson_discount WHERE lessonId IN (${lessons}) ORDER BY id`,
    lesson_payment: `SELECT * FROM lesson_payment WHERE lessonId IN (${lessons}) ORDER BY id`,
    customer_account: `SELECT * FROM customer_account WHERE customerId IN (${customers}) ORDER BY id`,
  };
  const s: Snapshot = {};
  for (const [table, query] of Object.entries(sql)) {
    // Read complete rows with explicit date casts, including nullable dates.
    // Joined selections first resolve primary keys, keeping backup row shape stable.
    const ids = await q.query(
      query.replace(
        /SELECT (?:\*|[dx]\.\*) FROM/,
        `SELECT ${query.includes('SELECT d.*') ? 'd.' : query.includes('SELECT x.*') ? 'x.' : ''}id FROM`,
      ),
    );
    s[table] = [];
    for (const row of ids)
      s[table].push(...(await readRows(q, table, 'id=?', [Number(row.id)])));
  }
  const balanceRepository = new CustomerBalanceCalculationRepository(
    q.connection,
  );
  s.calculated_balance = [];
  for (const customerId of [...new Set(s.invoice.map((r) => r.user_id))].sort(
    (a, b) => a - b,
  )) {
    const balance = await balanceRepository.calculateBalance(
      customerId,
      q.manager,
    );
    s.calculated_balance.push({ customerId, balance: decimal(cents(balance)) });
  }
  return s;
}

function plan(s: Snapshot): Change[] {
  const changes: Change[] = [];
  const reductions = new Map<number, number>();
  for (const c of CASES) {
    const invoice = s.invoice.find((r) => r.id === c.invoice);
    if (!invoice) continue; // Earlier dumps/fresh databases do not contain these invoices.
    const line = s.invoice_line_item.find((r) => r.id === c.line);
    const lesson = s.lesson.find((r) => r.id === c.lesson);
    const privateLesson = s.private_lesson.filter(
      (r) => r.lessonId === c.lesson,
    );
    const activeLines = s.invoice_line_item.filter(
      (r) => r.invoice_id === c.invoice && !r.isDeleted,
    );
    const links = s.invoice_item_lesson.filter(
      (r) => r.invoiceLineItemId === c.line,
    );
    if (
      invoice.user_id !== c.customer ||
      invoice.location_id !== c.location ||
      invoice.type !== 2 ||
      invoice.isDeleted ||
      invoice.isCanceled ||
      invoice.isVoid ||
      invoice.isTaxAdjusted ||
      !line ||
      line.isDeleted ||
      activeLines.length !== 1 ||
      activeLines[0].id !== c.line ||
      links.length !== 1 ||
      links[0].lessonId !== c.lesson ||
      !lesson ||
      lesson.isDeleted ||
      !lesson.isConfirmed ||
      lesson.isExploded ||
      lesson.status === 4 ||
      privateLesson.length !== 1 ||
      cents(privateLesson[0].total) !== cents(c.expected)
    ) {
      fail(
        `identity, eligibility or lesson price changed for invoice ${c.invoice}`,
      );
    }
    const discounts = s.invoice_line_item_discount.filter(
      (r) => r.invoiceLineItemId === c.line,
    );
    const prepaid = discounts.filter((r) => r.type === 7);
    const lessonPrepaid = s.lesson_discount.filter(
      (r) => r.lessonId === c.lesson && r.type === 7,
    );
    if (
      prepaid.length !== 1 ||
      lessonPrepaid.length !== 1 ||
      prepaid[0].valueType !== 0 ||
      cents(prepaid[0].value) !== cents(c.prepaid) ||
      cents(lessonPrepaid[0].value) !== cents(c.prepaid) ||
      discounts.some(
        (r) =>
          ![1, 3, 4, 7].includes(r.type) ||
          (r.type !== 7 &&
            Number(r.value) !== 0 &&
            !(
              c.invoice === 1172443 &&
              r.type === 4 &&
              r.valueType === 0 &&
              cents(r.value) === 109
            )),
      )
    ) {
      fail(`discounts changed for invoice ${c.invoice}`);
    }
    if (
      cents(line.amount) !== cents(lesson.programRate) ||
      Number(line.unit) !== 0.5 ||
      lesson.duration !== '00:30:00' ||
      cents(invoice.tax) !== 0 ||
      cents(line.tax_rate) !== 0 ||
      cents(invoice.subTotal) !== cents(invoice.total) ||
      cents(line.netTotal) !== cents(invoice.total)
    ) {
      fail(`amounts or tax changed for invoice ${c.invoice}`);
    }
    const paid = s.invoice_payment
      .filter((r) => r.invoice_id === c.invoice && !r.isDeleted)
      .reduce((sum, r) => {
        const payment = s.payment.find((p) => p.id === r.payment_id);
        if (!payment || payment.isDeleted)
          fail(`inactive payment allocation on invoice ${c.invoice}`);
        return sum + cents(r.amount);
      }, 0);
    if (cents(invoice.total) - paid !== cents(invoice.balance))
      fail(`balance does not reconcile for invoice ${c.invoice}`);
    const newBalance = cents(c.expected) - paid;
    if (newBalance < 0)
      fail(
        `invoice ${c.invoice} is now overpaid; credit/refund review required`,
      );
    if (cents(invoice.total) === cents(c.expected)) continue; // Already corrected, preserve it.
    if (cents(invoice.total) !== cents(c.old))
      fail(`invoice ${c.invoice} was edited`);
    const status = newBalance > 9 ? 1 : 2;
    changes.push({
      table: 'invoice_line_item',
      id: line.id,
      before: line,
      after: { ...line, netTotal: decimal(cents(c.expected)) },
    });
    changes.push({
      table: 'invoice',
      id: invoice.id,
      before: invoice,
      after: {
        ...invoice,
        subTotal: decimal(cents(c.expected)),
        total: decimal(cents(c.expected)),
        balance: decimal(newBalance),
        totalCopy: decimal(cents(c.expected)),
        status,
        paidStatus: status,
      },
    });
    reductions.set(
      c.customer,
      (reductions.get(c.customer) ?? 0) + cents(c.old) - cents(c.expected),
    );
  }
  for (const [customer, reduction] of reductions) {
    const accounts = s.customer_account.filter(
      (r) => r.customerId === customer,
    );
    if (accounts.length !== 1 || !Number.isFinite(Number(accounts[0].balance)))
      fail(`customer ${customer} account is missing or ambiguous`);
    const before = accounts[0];
    const calculated = s.calculated_balance.find(
      (r) => r.customerId === customer,
    );
    if (!calculated) fail(`customer ${customer} calculated balance is missing`);
    // Earlier dumps contained stale caches (including zero on owing accounts).
    // Refresh from the actual ledger; subtracting from the cache would invent credit.
    changes.push({
      table: 'customer_account',
      id: before.id,
      before,
      after: {
        ...before,
        balance: decimal(cents(calculated.balance) - reduction),
      },
    });
  }
  return changes;
}

function expectedSnapshot(before: Snapshot, changes: Change[]): Snapshot {
  const after = structuredClone(before);
  for (const change of changes)
    after[change.table] = after[change.table].map((r) =>
      r.id === change.id ? structuredClone(change.after) : r,
    );
  after.calculated_balance = calculatedAfterChanges(before, changes);
  return after;
}

function calculatedAfterChanges(before: Snapshot, changes: Change[]) {
  return before.calculated_balance.map((row) => ({
    ...row,
    balance: decimal(
      cents(row.balance) +
        changes
          .filter(
            (c) => c.table === 'invoice' && c.before.user_id === row.customerId,
          )
          .reduce(
            (sum, c) => sum + cents(c.after.balance) - cents(c.before.balance),
            0,
          ),
    ),
  }));
}

// Snapshot guards include allocations and payment rows, not just invoice totals.
// In particular, down refuses to overwrite a payment/edit made after up.
function assertResumable(
  current: Snapshot,
  before: Snapshot,
  changes: Change[],
) {
  const unchanged = structuredClone(current);
  const applied: Change[] = [];
  for (const change of changes) {
    const row = current[change.table].find((r) => r.id === change.id);
    if (hash(row) !== hash(change.before) && hash(row) !== hash(change.after))
      fail(`${change.table} ${change.id} changed outside the repair`);
    if (hash(row) === hash(change.after)) applied.push(change);
    unchanged[change.table] = unchanged[change.table].map((r) =>
      r.id === change.id ? change.before : r,
    );
  }
  if (
    hash(current.calculated_balance) !==
    hash(calculatedAfterChanges(before, applied))
  )
    fail('customer ledger changed outside the repair');
  unchanged.calculated_balance = structuredClone(before.calculated_balance);
  if (hash(unchanged) !== hash(before))
    fail('snapshot changed; stop financial edits and review the backup');
}

async function writeChanges(
  q: Pick<QueryRunner, 'query'>,
  changes: Change[],
  reverse = false,
) {
  for (const change of reverse ? [...changes].reverse() : changes) {
    const from = reverse ? change.after : change.before;
    const to = reverse ? change.before : change.after;
    const [row] = await readRows(q, change.table, 'id=?', [change.id]);
    if (hash(row) === hash(to)) continue;
    if (hash(row) !== hash(from))
      fail(`${change.table} ${change.id} changed during repair`);
    // Keep the original timestamps/user IDs; the backup is the repair's audit trail.
    const columns = Object.keys(to).filter((k) => k !== 'id');
    const guards = Object.keys(from);
    const result = await q.query(
      `UPDATE \`${change.table}\` SET ${columns.map((k) => `\`${k}\`=?`).join(',')} WHERE ${guards.map((k) => `\`${k}\` <=> ?`).join(' AND ')}`,
      [...columns.map((k) => to[k]), ...guards.map((k) => from[k])],
    );
    if (result.affectedRows !== 1)
      fail(`concurrent edit of ${change.table} ${change.id}`);
  }
}

export class RepairAuditedPrepaidLessonInvoices1789077600000 implements MigrationInterface {
  name = 'RepairAuditedPrepaidLessonInvoices1789077600000';
  static cases = CASES;
  static inspect = inspect;
  static plan = plan;
  static hash = hash;
  static assertResumable = assertResumable;
  static expectedSnapshot = expectedSnapshot;

  async up(q: QueryRunner): Promise<void> {
    // Dev has independently allocated invoice IDs that collide with this
    // production manifest. APP_ENV is the deployment target in our workflows.
    // Only explicit Dev/test targets skip; other targets retain every guard.
    const target = process.env.APP_ENV?.trim().toLowerCase();
    if (target && ['development', 'dev', 'test'].includes(target)) {
      console.info(
        'Skipping audited production prepaid invoice repair for APP_ENV=' +
          target,
      );
      return;
    }
    const journal = q.connection.createQueryRunner();
    await journal.connect();
    try {
      await this.apply(q, journal);
    } finally {
      await journal.release();
    }
  }

  private async apply(q: QueryRunner, journal: QueryRunner): Promise<void> {
    const current = await inspect(q);
    const tables = await journal.query(
      'SELECT 1 present FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',
      [BACKUP],
    );
    let saved = tables.length
      ? await journal.query(`SELECT * FROM ${BACKUP} WHERE migrationName=?`, [
          this.name,
        ])
      : [];
    let before: Snapshot, changes: Change[];
    if (saved.length) {
      before = JSON.parse(saved[0].beforeSnapshot);
      changes = JSON.parse(saved[0].changes);
      assertResumable(current, before, changes);
    } else {
      changes = plan(current); // Validate every case before creating backup or changing data.
      if (!changes.length) return;
      before = current;
      // customer_account is MyISAM in the reviewed dump. Do not claim an SQL
      // rollback covers it: retain a durable, resumable before/after journal.
      // Separate autocommit connection: the journal must survive a rollback of
      // TypeORM's outer transaction because MyISAM account updates do survive it.
      await journal.query(`CREATE TABLE IF NOT EXISTS ${BACKUP} (
        migrationName varchar(190) PRIMARY KEY,
        beforeSnapshot longtext NOT NULL,
        changes longtext NOT NULL,
        beforeHash char(64) NOT NULL,
        state varchar(20) NOT NULL DEFAULT 'prepared',
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`);
      await journal.query(
        `INSERT INTO ${BACKUP} (migrationName,beforeSnapshot,changes,beforeHash) VALUES (?,?,?,?)`,
        [
          this.name,
          JSON.stringify(before),
          JSON.stringify(changes),
          hash(before),
        ],
      );
      saved = await journal.query(
        `SELECT * FROM ${BACKUP} WHERE migrationName=?`,
        [this.name],
      );
    }
    assert.equal(saved.length, 1, 'Repair backup missing');
    assert.equal(
      saved[0].beforeHash,
      hash(before),
      'Repair backup checksum mismatch',
    );
    assert.equal(
      hash(changes),
      hash(plan(before)),
      'Repair plan checksum mismatch',
    );
    assertResumable(await inspect(q), before, changes);
    await writeChanges(q, changes);
    assert.equal(
      hash(await inspect(q)),
      hash(expectedSnapshot(before, changes)),
      'Repair postcondition failed',
    );
    await journal.query(
      `UPDATE ${BACKUP} SET state='applied' WHERE migrationName=?`,
      [this.name],
    );
  }

  async down(q: QueryRunner): Promise<void> {
    const tables = await q.query(
      'SELECT 1 present FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',
      [BACKUP],
    );
    if (!tables.length) return;
    const rows = await q.query(
      `SELECT * FROM ${BACKUP} WHERE migrationName=?`,
      [this.name],
    );
    if (!rows.length) return;
    const before: Snapshot = JSON.parse(rows[0].beforeSnapshot);
    const changes: Change[] = JSON.parse(rows[0].changes);
    assert.equal(
      rows[0].beforeHash,
      hash(before),
      'Repair backup checksum mismatch',
    );
    assert.equal(
      hash(changes),
      hash(plan(before)),
      'Repair plan checksum mismatch',
    );
    assertResumable(await inspect(q), before, changes);
    await writeChanges(q, changes, true);
    assert.equal(
      hash(await inspect(q)),
      hash(before),
      'Repair rollback postcondition failed',
    );
    await q.query(
      `UPDATE ${BACKUP} SET state='reverted' WHERE migrationName=?`,
      [this.name],
    );
    // Keep the backup. No invoice, lesson, allocation or payment row is deleted.
  }
}
