import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import BigNumber from 'bignumber.js';
import { MigrationInterface, QueryRunner } from 'typeorm';

type RepairCase = {
  lessonId: number;
  locationId: number;
  locationName: string;
  customerId: number;
  enrolmentId: number;
  lessonTotalCents: number;
  invoiceId: number | null;
  invoiceNumber: number | null;
  invoiceStatus: number | null;
  repairInvoice: boolean;
};

type AllocationSnapshot = {
  id: number;
  paymentId: number;
  enrolmentId: number | null;
  amountCents: number;
  isDeleted: number;
  paymentMethodId: number;
  paymentIsDeleted: number;
};

type InvoiceSnapshot = {
  id: number;
  invoiceNumber: number;
  customerId: number;
  locationId: number;
  totalCents: number;
  balanceCents: number;
  status: number;
  paidStatus: number;
  isDeleted: number;
  isCanceled: number;
  isVoid: number;
  updatedOn: string | null;
  updatedUserId: number;
  allocations: AllocationSnapshot[];
  paidCents: number;
};

type CandidateSnapshot = {
  lessonId: number;
  locationId: number;
  customerId: number;
  enrolmentId: number;
  lessonIsDeleted: number;
  privateLessonId: number;
  lessonTotalCents: number;
  lessonBalanceCents: number;
  lessonAllocations: AllocationSnapshot[];
  activeNonCreditPaidCents: number;
  invoices: InvoiceSnapshot[];
};

type RepairPlanItem = {
  source: RepairCase;
  before: CandidateSnapshot;
};

type GeneratedIds = {
  lessonId: number;
  accountEntryTransactionId: number;
  accountEntryPaymentId: number;
  accountEntryLessonPaymentId: number;
  creditAppliedTransactionId: number | null;
  creditAppliedPaymentId: number | null;
  invoicePaymentId: number | null;
  creditUsedTransactionId: number | null;
  creditUsedPaymentId: number | null;
  creditUsedLessonPaymentId: number | null;
  creditUsageId: number | null;
};

const CASES: readonly RepairCase[] = [
  {
    lessonId: 5019268,
    locationId: 15,
    locationName: 'Burlington',
    customerId: 7768,
    enrolmentId: 30968,
    lessonTotalCents: 3125,
    invoiceId: 1082655,
    invoiceNumber: 64981,
    invoiceStatus: 1,
    repairInvoice: true,
  },
  {
    lessonId: 5065959,
    locationId: 15,
    locationName: 'Burlington',
    customerId: 14194,
    enrolmentId: 32297,
    lessonTotalCents: 3625,
    invoiceId: 1149152,
    invoiceNumber: 70107,
    invoiceStatus: 2,
    repairInvoice: true,
  },
  {
    lessonId: 5073861,
    locationId: 15,
    locationName: 'Burlington',
    customerId: 11389,
    enrolmentId: 32350,
    lessonTotalCents: 3625,
    invoiceId: 1149153,
    invoiceNumber: 70108,
    invoiceStatus: 2,
    repairInvoice: true,
  },
  {
    lessonId: 5154512,
    locationId: 15,
    locationName: 'Burlington',
    customerId: 1514,
    enrolmentId: 28189,
    lessonTotalCents: 3125,
    invoiceId: null,
    invoiceNumber: null,
    invoiceStatus: null,
    repairInvoice: false,
  },
  {
    lessonId: 5180349,
    locationId: 15,
    locationName: 'Burlington',
    customerId: 13624,
    enrolmentId: 29251,
    lessonTotalCents: 3125,
    invoiceId: 1142178,
    invoiceNumber: 69502,
    invoiceStatus: 2,
    repairInvoice: true,
  },
  {
    lessonId: 5180354,
    locationId: 15,
    locationName: 'Burlington',
    customerId: 13593,
    enrolmentId: 30550,
    lessonTotalCents: 3125,
    invoiceId: 1142183,
    invoiceNumber: 69507,
    invoiceStatus: 2,
    repairInvoice: true,
  },
  {
    lessonId: 5248516,
    locationId: 15,
    locationName: 'Burlington',
    customerId: 13728,
    enrolmentId: 29961,
    lessonTotalCents: 2625,
    invoiceId: 1161194,
    invoiceNumber: 71254,
    invoiceStatus: 2,
    repairInvoice: true,
  },
  {
    lessonId: 5306119,
    locationId: 15,
    locationName: 'Burlington',
    customerId: 13624,
    enrolmentId: 29251,
    lessonTotalCents: 3125,
    invoiceId: null,
    invoiceNumber: null,
    invoiceStatus: null,
    repairInvoice: false,
  },
  {
    lessonId: 5306383,
    locationId: 15,
    locationName: 'Burlington',
    customerId: 13593,
    enrolmentId: 30550,
    lessonTotalCents: 3125,
    invoiceId: null,
    invoiceNumber: null,
    invoiceStatus: null,
    repairInvoice: false,
  },
  {
    lessonId: 5322589,
    locationId: 15,
    locationName: 'Burlington',
    customerId: 9849,
    enrolmentId: 28011,
    lessonTotalCents: 3625,
    invoiceId: 1171145,
    invoiceNumber: 72114,
    invoiceStatus: 2,
    repairInvoice: true,
  },
  {
    lessonId: 5417910,
    locationId: 15,
    locationName: 'Burlington',
    customerId: 7656,
    enrolmentId: 31864,
    lessonTotalCents: 2875,
    invoiceId: null,
    invoiceNumber: null,
    invoiceStatus: null,
    repairInvoice: false,
  },
  {
    lessonId: 4976458,
    locationId: 18,
    locationName: 'Newmarket',
    customerId: 5316,
    enrolmentId: 17329,
    lessonTotalCents: 4875,
    invoiceId: 1170863,
    invoiceNumber: 85839,
    invoiceStatus: 2,
    repairInvoice: true,
  },
  {
    lessonId: 5246831,
    locationId: 18,
    locationName: 'Newmarket',
    customerId: 10480,
    enrolmentId: 30748,
    lessonTotalCents: 4875,
    invoiceId: 1164124,
    invoiceNumber: 85443,
    invoiceStatus: 2,
    repairInvoice: true,
  },
  {
    lessonId: 4839950,
    locationId: 16,
    locationName: 'Richmond Hill',
    customerId: 12040,
    enrolmentId: 27108,
    lessonTotalCents: 3250,
    invoiceId: 1142325,
    invoiceNumber: 164519,
    invoiceStatus: 2,
    repairInvoice: true,
  },
  {
    lessonId: 4848941,
    locationId: 16,
    locationName: 'Richmond Hill',
    customerId: 13595,
    enrolmentId: 30862,
    lessonTotalCents: 3125,
    invoiceId: 1170848,
    invoiceNumber: 168007,
    invoiceStatus: 2,
    repairInvoice: true,
  },
  {
    lessonId: 4874665,
    locationId: 16,
    locationName: 'Richmond Hill',
    customerId: 2279,
    enrolmentId: 31004,
    lessonTotalCents: 3125,
    invoiceId: 1162042,
    invoiceNumber: 166985,
    invoiceStatus: 2,
    repairInvoice: true,
  },
  {
    lessonId: 5001955,
    locationId: 16,
    locationName: 'Richmond Hill',
    customerId: 10660,
    enrolmentId: 20045,
    lessonTotalCents: 4875,
    invoiceId: null,
    invoiceNumber: null,
    invoiceStatus: null,
    repairInvoice: false,
  },
  {
    lessonId: 5072927,
    locationId: 16,
    locationName: 'Richmond Hill',
    customerId: 14454,
    enrolmentId: 32341,
    lessonTotalCents: 4875,
    invoiceId: 1142442,
    invoiceNumber: 164636,
    invoiceStatus: 2,
    repairInvoice: true,
  },
  // The invoice is already fully paid. Only the underallocated lesson needs correction.
  {
    lessonId: 5206911,
    locationId: 16,
    locationName: 'Richmond Hill',
    customerId: 10630,
    enrolmentId: 21998,
    lessonTotalCents: 3500,
    invoiceId: 1138613,
    invoiceNumber: 164242,
    invoiceStatus: 2,
    repairInvoice: false,
  },
  {
    lessonId: 5238916,
    locationId: 16,
    locationName: 'Richmond Hill',
    customerId: 9506,
    enrolmentId: 21846,
    lessonTotalCents: 4875,
    invoiceId: 1144706,
    invoiceNumber: 164898,
    invoiceStatus: 2,
    repairInvoice: true,
  },
  {
    lessonId: 5270993,
    locationId: 16,
    locationName: 'Richmond Hill',
    customerId: 11873,
    enrolmentId: 32644,
    lessonTotalCents: 3125,
    invoiceId: 1171288,
    invoiceNumber: 168074,
    invoiceStatus: 2,
    repairInvoice: true,
  },
  {
    lessonId: 4574844,
    locationId: 9,
    locationName: 'Woodbridge',
    customerId: 7333,
    enrolmentId: 25551,
    lessonTotalCents: 2875,
    invoiceId: null,
    invoiceNumber: null,
    invoiceStatus: null,
    repairInvoice: false,
  },
  {
    lessonId: 5151714,
    locationId: 9,
    locationName: 'Woodbridge',
    customerId: 12993,
    enrolmentId: 27227,
    lessonTotalCents: 3500,
    invoiceId: 1125402,
    invoiceNumber: 188300,
    invoiceStatus: 1,
    repairInvoice: true,
  },
] as const;

const JOURNAL_TABLE = 'migration_historical_cent_residual_repair';
const UPDATED_BY_USER_ID = 727;
const CORRECTION_CENTS = 1;
const CORRECTION_AMOUNT = '0.0100';
const NOTES = 'Verified historical $0.01 rounding residual correction';

type DatabaseRow = Record<string, unknown>;

function scalarString(value: unknown, fallback?: string): string {
  if (value === null || value === undefined) {
    if (fallback !== undefined) return fallback;
    fail('database value is unexpectedly null');
  }
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'bigint'
  ) {
    fail('database value is not a scalar');
  }
  return `${value}`;
}

const toCents = (value: unknown): number =>
  new BigNumber(scalarString(value, '0'))
    .times(100)
    .integerValue(BigNumber.ROUND_HALF_UP)
    .toNumber();

const normalizeDate = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date)
    return value.toISOString().slice(0, 19).replace('T', ' ');
  return scalarString(value).slice(0, 19).replace('T', ' ');
};

const hash = (value: unknown): string => {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) fail('value cannot be serialized');
  return createHash('sha256').update(serialized).digest('hex');
};

function fail(message: string): never {
  throw new Error(`Historical cent residual repair refused: ${message}`);
}

function isDatabaseRow(value: unknown): value is DatabaseRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function queryRows(
  queryRunner: Pick<QueryRunner, 'query'>,
  sql: string,
  parameters: unknown[] = [],
): Promise<DatabaseRow[]> {
  const result: unknown = await queryRunner.query(sql, parameters);
  if (!Array.isArray(result) || !result.every(isDatabaseRow))
    fail('database query did not return rows');
  return result;
}

async function executeStatement(
  queryRunner: Pick<QueryRunner, 'query'>,
  sql: string,
  parameters: unknown[] = [],
): Promise<DatabaseRow> {
  const result: unknown = await queryRunner.query(sql, parameters);
  if (!isDatabaseRow(result)) fail('database statement returned no result');
  return result;
}

function parseJson<T>(value: unknown): T {
  const parsed: unknown = JSON.parse(scalarString(value));
  return parsed as T;
}

function affectedRows(result: DatabaseRow): number {
  return Number(result.affectedRows ?? 0);
}

function sumActiveAllocations(
  allocations: AllocationSnapshot[],
  excludedPaymentMethodIds: number[] = [],
): number {
  return allocations
    .filter(
      (row) =>
        row.isDeleted === 0 &&
        row.paymentIsDeleted === 0 &&
        !excludedPaymentMethodIds.includes(row.paymentMethodId),
    )
    .reduce((sum, row) => sum + row.amountCents, 0);
}

async function inspectCases(
  queryRunner: Pick<QueryRunner, 'query'>,
): Promise<CandidateSnapshot[]> {
  const snapshots: CandidateSnapshot[] = [];

  for (const repairCase of CASES) {
    const lessonRows = await queryRows(
      queryRunner,
      `
        SELECT
          l.id AS lessonId,
          l.isDeleted AS lessonIsDeleted,
          c.locationId,
          pl.id AS privateLessonId,
          pl.total AS lessonTotal,
          pl.balance AS lessonBalance,
          e.id AS enrolmentId,
          st.customer_id AS customerId
        FROM lesson l
        INNER JOIN private_lesson pl ON pl.lessonId = l.id
        INNER JOIN course c ON c.id = l.courseId
        INNER JOIN enrolment e ON e.id = ?
        INNER JOIN student st ON st.id = e.studentId
        WHERE l.id = ?
      `,
      [repairCase.enrolmentId, repairCase.lessonId],
    );

    if (lessonRows.length === 0) continue;
    if (lessonRows.length !== 1)
      fail(`lesson ${repairCase.lessonId} is missing or ambiguous`);

    const lessonRow = lessonRows[0];
    const lessonPaymentRows = await queryRows(
      queryRunner,
      `
        SELECT
          lp.id,
          lp.paymentId,
          lp.enrolmentId,
          lp.amount,
          lp.isDeleted,
          p.payment_method_id AS paymentMethodId,
          p.isDeleted AS paymentIsDeleted
        FROM lesson_payment lp
        INNER JOIN payment p ON p.id = lp.paymentId
        WHERE lp.lessonId = ?
        ORDER BY lp.id
      `,
      [repairCase.lessonId],
    );
    const lessonAllocations = lessonPaymentRows.map(toAllocationSnapshot);

    const invoiceRows = await queryRows(
      queryRunner,
      `
        SELECT DISTINCT
          i.id,
          i.invoice_number AS invoiceNumber,
          i.user_id AS customerId,
          i.location_id AS locationId,
          i.total,
          i.balance,
          i.status,
          i.paidStatus,
          i.isDeleted,
          i.isCanceled,
          i.isVoid,
          i.updatedOn,
          i.updatedUserId
        FROM invoice i
        INNER JOIN invoice_line_item ili
          ON ili.invoice_id = i.id
         AND ili.isDeleted = 0
        INNER JOIN invoice_item_lesson iil
          ON iil.invoiceLineItemId = ili.id
        WHERE iil.lessonId = ?
          AND i.type = 2
          AND i.isDeleted = 0
          AND i.isCanceled = 0
          AND i.isVoid = 0
        ORDER BY i.id
      `,
      [repairCase.lessonId],
    );

    const invoices: InvoiceSnapshot[] = [];
    for (const invoiceRow of invoiceRows) {
      const invoicePaymentRows = await queryRows(
        queryRunner,
        `
          SELECT
            ip.id,
            ip.payment_id AS paymentId,
            NULL AS enrolmentId,
            ip.amount,
            ip.isDeleted,
            p.payment_method_id AS paymentMethodId,
            p.isDeleted AS paymentIsDeleted
          FROM invoice_payment ip
          INNER JOIN payment p ON p.id = ip.payment_id
          WHERE ip.invoice_id = ?
          ORDER BY ip.id
        `,
        [Number(invoiceRow.id)],
      );
      const allocations = invoicePaymentRows.map(toAllocationSnapshot);
      invoices.push({
        id: Number(invoiceRow.id),
        invoiceNumber: Number(invoiceRow.invoiceNumber),
        customerId: Number(invoiceRow.customerId),
        locationId: Number(invoiceRow.locationId),
        totalCents: toCents(invoiceRow.total),
        balanceCents: toCents(invoiceRow.balance),
        status: Number(invoiceRow.status),
        paidStatus: Number(invoiceRow.paidStatus),
        isDeleted: Number(invoiceRow.isDeleted),
        isCanceled: Number(invoiceRow.isCanceled),
        isVoid: Number(invoiceRow.isVoid),
        updatedOn: normalizeDate(invoiceRow.updatedOn),
        updatedUserId: Number(invoiceRow.updatedUserId),
        allocations,
        paidCents: sumActiveAllocations(allocations),
      });
    }

    snapshots.push({
      lessonId: Number(lessonRow.lessonId),
      locationId: Number(lessonRow.locationId),
      customerId: Number(lessonRow.customerId),
      enrolmentId: Number(lessonRow.enrolmentId),
      lessonIsDeleted: Number(lessonRow.lessonIsDeleted),
      privateLessonId: Number(lessonRow.privateLessonId),
      lessonTotalCents: toCents(lessonRow.lessonTotal),
      lessonBalanceCents: toCents(lessonRow.lessonBalance),
      lessonAllocations,
      activeNonCreditPaidCents: sumActiveAllocations(lessonAllocations, [2]),
      invoices,
    });
  }

  return snapshots;
}

function toAllocationSnapshot(row: DatabaseRow): AllocationSnapshot {
  return {
    id: Number(row.id),
    paymentId: Number(row.paymentId),
    enrolmentId:
      row.enrolmentId === null || row.enrolmentId === undefined
        ? null
        : Number(row.enrolmentId),
    amountCents: toCents(row.amount),
    isDeleted: Number(row.isDeleted),
    paymentMethodId: Number(row.paymentMethodId),
    paymentIsDeleted: Number(row.paymentIsDeleted),
  };
}

function plan(snapshots: CandidateSnapshot[]): RepairPlanItem[] {
  if (snapshots.length === 0) return [];
  if (snapshots.length !== CASES.length)
    fail(`found ${snapshots.length} of ${CASES.length} allowlisted lessons`);

  return CASES.map((repairCase) => {
    const snapshot = snapshots.find(
      (candidate) => candidate.lessonId === repairCase.lessonId,
    );
    if (!snapshot) fail(`lesson ${repairCase.lessonId} was not found`);

    if (
      snapshot.locationId !== repairCase.locationId ||
      snapshot.customerId !== repairCase.customerId ||
      snapshot.enrolmentId !== repairCase.enrolmentId ||
      snapshot.lessonIsDeleted !== 0 ||
      snapshot.lessonTotalCents !== repairCase.lessonTotalCents ||
      snapshot.lessonBalanceCents !== CORRECTION_CENTS ||
      snapshot.activeNonCreditPaidCents !==
        repairCase.lessonTotalCents - CORRECTION_CENTS
    ) {
      fail(`lesson ${repairCase.lessonId} identity or balance changed`);
    }

    const expectedInvoiceCount = repairCase.invoiceId === null ? 0 : 1;
    if (snapshot.invoices.length !== expectedInvoiceCount)
      fail(`lesson ${repairCase.lessonId} invoice links changed`);

    if (repairCase.invoiceId !== null) {
      const invoice = snapshot.invoices[0];
      const expectedBalance = repairCase.repairInvoice ? 1 : 0;
      const expectedPaid =
        repairCase.lessonTotalCents -
        (repairCase.repairInvoice ? CORRECTION_CENTS : 0);
      if (
        invoice.id !== repairCase.invoiceId ||
        invoice.invoiceNumber !== repairCase.invoiceNumber ||
        invoice.customerId !== repairCase.customerId ||
        invoice.locationId !== repairCase.locationId ||
        invoice.totalCents !== repairCase.lessonTotalCents ||
        invoice.balanceCents !== expectedBalance ||
        invoice.paidCents !== expectedPaid ||
        invoice.status !== repairCase.invoiceStatus ||
        invoice.isDeleted !== 0 ||
        invoice.isCanceled !== 0 ||
        invoice.isVoid !== 0
      ) {
        fail(`invoice ${repairCase.invoiceId} identity or balance changed`);
      }
    }

    return { source: repairCase, before: snapshot };
  });
}

function withoutGeneratedRows(
  snapshots: CandidateSnapshot[],
  before: CandidateSnapshot[],
  generated: GeneratedIds[],
): CandidateSnapshot[] {
  const result = structuredClone(snapshots);
  for (const ids of generated) {
    const current = result.find((row) => row.lessonId === ids.lessonId);
    const original = before.find((row) => row.lessonId === ids.lessonId);
    if (!current || !original) fail(`lesson ${ids.lessonId} snapshot missing`);
    const generatedLessonPaymentIds = [
      ids.accountEntryLessonPaymentId,
      ids.creditUsedLessonPaymentId,
    ].filter((id): id is number => id !== null);
    current.lessonAllocations = current.lessonAllocations.filter(
      (row) => !generatedLessonPaymentIds.includes(row.id),
    );
    current.lessonBalanceCents = original.lessonBalanceCents;
    current.activeNonCreditPaidCents = original.activeNonCreditPaidCents;

    if (ids.invoicePaymentId !== null) {
      const invoice = current.invoices[0];
      const oldInvoice = original.invoices[0];
      if (!invoice || !oldInvoice)
        fail(`invoice snapshot missing for lesson ${ids.lessonId}`);
      invoice.allocations = invoice.allocations.filter(
        (row) => row.id !== ids.invoicePaymentId,
      );
      invoice.paidCents = oldInvoice.paidCents;
      invoice.balanceCents = oldInvoice.balanceCents;
      invoice.status = oldInvoice.status;
      invoice.updatedOn = oldInvoice.updatedOn;
      invoice.updatedUserId = oldInvoice.updatedUserId;
    }
  }
  return result;
}

function assertPostconditions(
  snapshots: CandidateSnapshot[],
  before: CandidateSnapshot[],
  generated: GeneratedIds[],
): void {
  if (generated.length !== CASES.length)
    fail(`generated ${generated.length} of ${CASES.length} corrections`);

  for (const repairCase of CASES) {
    const snapshot = snapshots.find(
      (candidate) => candidate.lessonId === repairCase.lessonId,
    );
    if (
      !snapshot ||
      snapshot.lessonBalanceCents !== 0 ||
      snapshot.activeNonCreditPaidCents !== repairCase.lessonTotalCents
    ) {
      fail(`lesson ${repairCase.lessonId} postcondition failed`);
    }
    if (repairCase.repairInvoice) {
      const invoice = snapshot.invoices[0];
      if (
        !invoice ||
        invoice.balanceCents !== 0 ||
        invoice.paidCents !== invoice.totalCents ||
        invoice.status !== 2
      ) {
        fail(`invoice ${repairCase.invoiceId} postcondition failed`);
      }
    }
  }

  if (hash(withoutGeneratedRows(snapshots, before, generated)) !== hash(before))
    fail('an original lesson, invoice, or allocation changed during repair');
}

async function insertAndGetId(
  queryRunner: Pick<QueryRunner, 'query'>,
  sql: string,
  parameters: unknown[] = [],
): Promise<number> {
  const result = await executeStatement(queryRunner, sql, parameters);
  const raw = isDatabaseRow(result.raw) ? result.raw : undefined;
  const id = result.insertId ?? raw?.insertId;
  if (!Number.isInteger(Number(id)) || Number(id) <= 0)
    fail('database insert did not return an ID');
  return Number(id);
}

async function createTransaction(
  queryRunner: Pick<QueryRunner, 'query'>,
): Promise<number> {
  return insertAndGetId(
    queryRunner,
    `
      INSERT INTO \`transaction\` (
        createdOn, updatedOn, createdByUserId, updatedByUserId
      ) VALUES (CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)
    `,
    [UPDATED_BY_USER_ID, UPDATED_BY_USER_ID],
  );
}

async function createPayment(
  queryRunner: Pick<QueryRunner, 'query'>,
  transactionId: number,
  customerId: number,
  paymentMethodId: number,
  amount: string,
  reference: string,
): Promise<number> {
  return insertAndGetId(
    queryRunner,
    `
      INSERT INTO payment (
        transactionId, user_id, payment_method_id, amount, date, reference,
        notes, isDeleted, createdOn, updatedOn, createdByUserId,
        updatedByUserId, balance
      ) VALUES (
        ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, 0, CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP, ?, ?, 0.0000
      )
    `,
    [
      transactionId,
      customerId,
      paymentMethodId,
      amount,
      reference,
      NOTES,
      UPDATED_BY_USER_ID,
      UPDATED_BY_USER_ID,
    ],
  );
}

async function createLessonPayment(
  queryRunner: Pick<QueryRunner, 'query'>,
  lessonId: number,
  paymentId: number,
  enrolmentId: number,
  amount: string,
): Promise<number> {
  return insertAndGetId(
    queryRunner,
    `
      INSERT INTO lesson_payment (
        lessonId, paymentId, enrolmentId, amount, royaltyCategoryId,
        royaltyRateApplied, isDeleted, date, createdOn, updatedOn,
        createdByUserId, updatedByUserId
      ) VALUES (
        ?, ?, ?, ?, NULL, NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP, ?, ?
      )
    `,
    [
      lessonId,
      paymentId,
      enrolmentId,
      amount,
      UPDATED_BY_USER_ID,
      UPDATED_BY_USER_ID,
    ],
  );
}

async function applyRepair(
  queryRunner: Pick<QueryRunner, 'query'>,
  item: RepairPlanItem,
): Promise<GeneratedIds> {
  const { source, before } = item;
  const accountEntryTransactionId = await createTransaction(queryRunner);
  const accountEntryPaymentId = await createPayment(
    queryRunner,
    accountEntryTransactionId,
    source.customerId,
    1,
    CORRECTION_AMOUNT,
    `ROUNDING-L-${source.lessonId}`,
  );
  const accountEntryLessonPaymentId = await createLessonPayment(
    queryRunner,
    source.lessonId,
    accountEntryPaymentId,
    source.enrolmentId,
    CORRECTION_AMOUNT,
  );

  const ids: GeneratedIds = {
    lessonId: source.lessonId,
    accountEntryTransactionId,
    accountEntryPaymentId,
    accountEntryLessonPaymentId,
    creditAppliedTransactionId: null,
    creditAppliedPaymentId: null,
    invoicePaymentId: null,
    creditUsedTransactionId: null,
    creditUsedPaymentId: null,
    creditUsedLessonPaymentId: null,
    creditUsageId: null,
  };

  if (source.repairInvoice) {
    assert(source.invoiceId !== null && source.invoiceNumber !== null);
    ids.creditAppliedTransactionId = await createTransaction(queryRunner);
    ids.creditAppliedPaymentId = await createPayment(
      queryRunner,
      ids.creditAppliedTransactionId,
      source.customerId,
      3,
      CORRECTION_AMOUNT,
      `L-${source.lessonId.toString().padStart(6, '0')}`,
    );
    ids.invoicePaymentId = await insertAndGetId(
      queryRunner,
      `
        INSERT INTO invoice_payment (
          invoice_id, payment_id, amount, isDeleted, date, createdOn,
          updatedOn, createdByUserId, updatedByUserId
        ) VALUES (
          ?, ?, 0.0100, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP, ?, ?
        )
      `,
      [
        source.invoiceId,
        ids.creditAppliedPaymentId,
        UPDATED_BY_USER_ID,
        UPDATED_BY_USER_ID,
      ],
    );

    ids.creditUsedTransactionId = await createTransaction(queryRunner);
    ids.creditUsedPaymentId = await createPayment(
      queryRunner,
      ids.creditUsedTransactionId,
      source.customerId,
      2,
      '-0.0100',
      `I-${source.invoiceNumber.toString().padStart(5, '0')}`,
    );
    ids.creditUsedLessonPaymentId = await createLessonPayment(
      queryRunner,
      source.lessonId,
      ids.creditUsedPaymentId,
      source.enrolmentId,
      '-0.0100',
    );
    ids.creditUsageId = await insertAndGetId(
      queryRunner,
      `
        INSERT INTO credit_usage (credit_payment_id, debit_payment_id)
        VALUES (?, ?)
      `,
      [ids.creditAppliedPaymentId, ids.creditUsedPaymentId],
    );

    const invoiceResult = await executeStatement(
      queryRunner,
      `
        UPDATE invoice
        SET balance = 0.0000,
            status = 2,
            updatedOn = CURRENT_TIMESTAMP,
            updatedUserId = ?
        WHERE id = ?
          AND user_id = ?
          AND location_id = ?
          AND total = ?
          AND balance = 0.0100
          AND status = ?
          AND isDeleted = 0
          AND isCanceled = 0
          AND isVoid = 0
      `,
      [
        UPDATED_BY_USER_ID,
        source.invoiceId,
        source.customerId,
        source.locationId,
        (source.lessonTotalCents / 100).toFixed(4),
        source.invoiceStatus,
      ],
    );
    if (affectedRows(invoiceResult) !== 1)
      fail(`concurrent change to invoice ${source.invoiceId}`);
  }

  const lessonResult = await executeStatement(
    queryRunner,
    `
      UPDATE private_lesson
      SET balance = 0.0000
      WHERE id = ?
        AND lessonId = ?
        AND total = ?
        AND balance = 0.0100
    `,
    [
      before.privateLessonId,
      source.lessonId,
      (source.lessonTotalCents / 100).toFixed(4),
    ],
  );
  if (affectedRows(lessonResult) !== 1)
    fail(`concurrent change to lesson ${source.lessonId}`);

  return ids;
}

async function assertPaymentMethods(
  queryRunner: Pick<QueryRunner, 'query'>,
): Promise<void> {
  const rows = await queryRows(
    queryRunner,
    `SELECT id, name, active FROM payment_method WHERE id IN (1, 2, 3) ORDER BY id`,
  );
  const expected = [
    { id: 1, name: 'Account Entry' },
    { id: 2, name: 'Credit Used' },
    { id: 3, name: 'Credit Applied' },
  ];
  if (
    rows.length !== expected.length ||
    expected.some((item, index) => {
      const row = rows[index];
      return (
        Number(row?.id) !== item.id ||
        scalarString(row?.name) !== item.name ||
        (item.id === 1 && Number(row?.active) !== 1)
      );
    })
  ) {
    fail(
      'payment methods 1, 2, and 3 do not match the expected internal methods',
    );
  }
}

async function assertGeneratedRows(
  queryRunner: Pick<QueryRunner, 'query'>,
  generated: GeneratedIds[],
): Promise<void> {
  if (
    generated.length !== CASES.length ||
    new Set(generated.map((row) => row.lessonId)).size !== CASES.length
  ) {
    fail('generated correction manifest is incomplete or duplicated');
  }

  for (const ids of generated) {
    const repairCase = CASES.find((row) => row.lessonId === ids.lessonId)!;
    const invoiceIds = [
      ids.creditAppliedTransactionId,
      ids.creditAppliedPaymentId,
      ids.invoicePaymentId,
      ids.creditUsedTransactionId,
      ids.creditUsedPaymentId,
      ids.creditUsedLessonPaymentId,
      ids.creditUsageId,
    ];
    if (
      (repairCase.repairInvoice && invoiceIds.some((id) => id === null)) ||
      (!repairCase.repairInvoice && invoiceIds.some((id) => id !== null))
    ) {
      fail(`generated transfer shape changed for lesson ${ids.lessonId}`);
    }

    const transactionIds = [
      ids.accountEntryTransactionId,
      ids.creditAppliedTransactionId,
      ids.creditUsedTransactionId,
    ].filter((id): id is number => id !== null);
    const transactions = await queryRows(
      queryRunner,
      `
        SELECT id, createdByUserId, updatedByUserId
        FROM \`transaction\`
        WHERE id IN (${transactionIds.map(() => '?').join(',')})
      `,
      transactionIds,
    );
    if (
      transactions.length !== transactionIds.length ||
      transactions.some(
        (row) =>
          Number(row.createdByUserId) !== UPDATED_BY_USER_ID ||
          Number(row.updatedByUserId) !== UPDATED_BY_USER_ID,
      )
    ) {
      fail(`generated transactions changed for lesson ${ids.lessonId}`);
    }

    const paymentIds = [
      ids.accountEntryPaymentId,
      ids.creditAppliedPaymentId,
      ids.creditUsedPaymentId,
    ].filter((id): id is number => id !== null);
    const payments = await queryRows(
      queryRunner,
      `
        SELECT id, user_id AS customerId, payment_method_id AS methodId,
               amount, balance, isDeleted, notes
        FROM payment
        WHERE id IN (${paymentIds.map(() => '?').join(',')})
        ORDER BY id
      `,
      paymentIds,
    );
    if (payments.length !== paymentIds.length)
      fail(`generated payments missing for lesson ${ids.lessonId}`);
    for (const payment of payments) {
      const methodId = Number(payment.methodId);
      const expectedAmount = methodId === 2 ? -1 : 1;
      if (
        Number(payment.customerId) !== repairCase.customerId ||
        ![1, 2, 3].includes(methodId) ||
        toCents(payment.amount) !== expectedAmount ||
        toCents(payment.balance) !== 0 ||
        Number(payment.isDeleted) !== 0 ||
        scalarString(payment.notes) !== NOTES
      ) {
        fail(`generated payment ${Number(payment.id)} changed`);
      }
    }

    const lessonPaymentIds = [
      ids.accountEntryLessonPaymentId,
      ids.creditUsedLessonPaymentId,
    ].filter((id): id is number => id !== null);
    const lessonPayments = await queryRows(
      queryRunner,
      `
        SELECT id, lessonId, paymentId, enrolmentId, amount, isDeleted
        FROM lesson_payment
        WHERE id IN (${lessonPaymentIds.map(() => '?').join(',')})
        ORDER BY id
      `,
      lessonPaymentIds,
    );
    if (
      lessonPayments.length !== lessonPaymentIds.length ||
      lessonPayments.some((row: Record<string, unknown>) => {
        const isAccountEntry =
          Number(row.id) === ids.accountEntryLessonPaymentId;
        return (
          Number(row.lessonId) !== repairCase.lessonId ||
          Number(row.enrolmentId) !== repairCase.enrolmentId ||
          Number(row.paymentId) !==
            (isAccountEntry
              ? ids.accountEntryPaymentId
              : ids.creditUsedPaymentId) ||
          toCents(row.amount) !== (isAccountEntry ? 1 : -1) ||
          Number(row.isDeleted) !== 0
        );
      })
    ) {
      fail(`generated lesson allocations changed for lesson ${ids.lessonId}`);
    }

    if (repairCase.repairInvoice) {
      const [invoicePayment] = await queryRows(
        queryRunner,
        `
          SELECT id, invoice_id AS invoiceId, payment_id AS paymentId,
                 amount, isDeleted
          FROM invoice_payment
          WHERE id = ?
        `,
        [ids.invoicePaymentId],
      );
      const [creditUsage] = await queryRows(
        queryRunner,
        `
          SELECT id, credit_payment_id AS creditPaymentId,
                 debit_payment_id AS debitPaymentId
          FROM credit_usage
          WHERE id = ?
        `,
        [ids.creditUsageId],
      );
      if (
        !invoicePayment ||
        Number(invoicePayment.invoiceId) !== repairCase.invoiceId ||
        Number(invoicePayment.paymentId) !== ids.creditAppliedPaymentId ||
        toCents(invoicePayment.amount) !== 1 ||
        Number(invoicePayment.isDeleted) !== 0 ||
        !creditUsage ||
        Number(creditUsage.creditPaymentId) !== ids.creditAppliedPaymentId ||
        Number(creditUsage.debitPaymentId) !== ids.creditUsedPaymentId
      ) {
        fail(`generated invoice transfer changed for lesson ${ids.lessonId}`);
      }
    }
  }
}

async function assertGeneratedRowsAbsent(
  queryRunner: Pick<QueryRunner, 'query'>,
  generated: GeneratedIds[],
): Promise<void> {
  const tableIds: Array<{ table: string; ids: number[] }> = [
    {
      table: 'transaction',
      ids: generated.flatMap((row) =>
        [
          row.accountEntryTransactionId,
          row.creditAppliedTransactionId,
          row.creditUsedTransactionId,
        ].filter((id): id is number => id !== null),
      ),
    },
    {
      table: 'payment',
      ids: generated.flatMap((row) =>
        [
          row.accountEntryPaymentId,
          row.creditAppliedPaymentId,
          row.creditUsedPaymentId,
        ].filter((id): id is number => id !== null),
      ),
    },
    {
      table: 'lesson_payment',
      ids: generated.flatMap((row) =>
        [row.accountEntryLessonPaymentId, row.creditUsedLessonPaymentId].filter(
          (id): id is number => id !== null,
        ),
      ),
    },
    {
      table: 'invoice_payment',
      ids: generated
        .map((row) => row.invoicePaymentId)
        .filter((id): id is number => id !== null),
    },
    {
      table: 'credit_usage',
      ids: generated
        .map((row) => row.creditUsageId)
        .filter((id): id is number => id !== null),
    },
  ];

  for (const { table, ids } of tableIds) {
    if (ids.length === 0) continue;
    assert.match(table, /^[a-z_]+$/);
    const rows = await queryRows(
      queryRunner,
      `SELECT id FROM \`${table}\` WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids,
    );
    if (rows.length !== 0)
      fail(`rolled-back generated rows still exist in ${table}`);
  }
}

export class RepairVerifiedHistoricalCentResiduals1791100000000 implements MigrationInterface {
  name = 'RepairVerifiedHistoricalCentResiduals1791100000000';
  static cases = CASES;
  static plan = plan;
  static assertPostconditions = assertPostconditions;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const target = process.env.APP_ENV?.trim().toLowerCase();
    if (target && ['development', 'dev', 'test'].includes(target)) {
      console.info(
        `Skipping production historical cent repair for APP_ENV=${target}`,
      );
      return;
    }

    const current = await inspectCases(queryRunner);
    if (current.length === 0) return;

    const journal = queryRunner.connection.createQueryRunner();
    await journal.connect();
    try {
      await executeStatement(
        journal,
        `
        CREATE TABLE IF NOT EXISTS \`${JOURNAL_TABLE}\` (
          migrationName varchar(190) NOT NULL,
          beforeSnapshot longtext NOT NULL,
          beforeHash char(64) NOT NULL,
          generatedRows longtext NULL,
          state varchar(20) NOT NULL DEFAULT 'prepared',
          createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt timestamp NULL DEFAULT NULL,
          PRIMARY KEY (migrationName)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8
      `,
      );

      const savedRows = await queryRows(
        journal,
        `SELECT * FROM \`${JOURNAL_TABLE}\` WHERE migrationName = ?`,
        [this.name],
      );
      let before = current;
      let savedGenerated: GeneratedIds[] = [];

      if (savedRows.length === 0) {
        plan(current);
        await assertPaymentMethods(queryRunner);
        await executeStatement(
          journal,
          `
            INSERT INTO \`${JOURNAL_TABLE}\` (
              migrationName, beforeSnapshot, beforeHash, state
            ) VALUES (?, ?, ?, 'prepared')
          `,
          [this.name, JSON.stringify(before), hash(before)],
        );
      } else {
        before = parseJson<CandidateSnapshot[]>(savedRows[0].beforeSnapshot);
        if (savedRows[0].beforeHash !== hash(before))
          fail('journal checksum mismatch');
        savedGenerated = savedRows[0].generatedRows
          ? parseJson<GeneratedIds[]>(savedRows[0].generatedRows)
          : [];

        if (savedGenerated.length) {
          try {
            assertPostconditions(current, before, savedGenerated);
            await assertGeneratedRows(queryRunner, savedGenerated);
            return;
          } catch {
            if (hash(current) !== hash(before))
              fail(
                'journal exists but database is neither before nor after state',
              );
            await assertGeneratedRowsAbsent(queryRunner, savedGenerated);
          }
        } else if (hash(current) !== hash(before)) {
          fail('database changed after the repair journal was prepared');
        }
        await assertPaymentMethods(queryRunner);
      }

      const repairPlan = plan(before);
      const generated: GeneratedIds[] = [];
      for (const item of repairPlan)
        generated.push(await applyRepair(queryRunner, item));

      const after = await inspectCases(queryRunner);
      assertPostconditions(after, before, generated);
      await assertGeneratedRows(queryRunner, generated);

      const journalResult = await executeStatement(
        journal,
        `
          UPDATE \`${JOURNAL_TABLE}\`
          SET generatedRows = ?, state = 'applied', updatedAt = CURRENT_TIMESTAMP
          WHERE migrationName = ? AND beforeHash = ?
        `,
        [JSON.stringify(generated), this.name, hash(before)],
      );
      if (affectedRows(journalResult) !== 1)
        fail('repair journal could not be finalized');
    } finally {
      await journal.release();
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableRows = await queryRows(
      queryRunner,
      `
        SELECT 1
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      `,
      [JOURNAL_TABLE],
    );
    if (tableRows.length === 0) return;

    const [journal] = await queryRows(
      queryRunner,
      `SELECT * FROM \`${JOURNAL_TABLE}\` WHERE migrationName = ?`,
      [this.name],
    );
    if (!journal || !journal.generatedRows) return;

    const before = parseJson<CandidateSnapshot[]>(journal.beforeSnapshot);
    const generated = parseJson<GeneratedIds[]>(journal.generatedRows);
    if (journal.beforeHash !== hash(before)) fail('journal checksum mismatch');

    const current = await inspectCases(queryRunner);
    assertPostconditions(current, before, generated);
    await assertGeneratedRows(queryRunner, generated);

    for (const ids of [...generated].reverse()) {
      if (ids.creditUsageId !== null)
        await executeStatement(
          queryRunner,
          `DELETE FROM credit_usage WHERE id = ?`,
          [ids.creditUsageId],
        );
      if (ids.invoicePaymentId !== null)
        await executeStatement(
          queryRunner,
          `DELETE FROM invoice_payment WHERE id = ?`,
          [ids.invoicePaymentId],
        );
      await executeStatement(
        queryRunner,
        `DELETE FROM lesson_payment WHERE id IN (?, ?)`,
        [ids.accountEntryLessonPaymentId, ids.creditUsedLessonPaymentId ?? 0],
      );

      const paymentIds = [
        ids.accountEntryPaymentId,
        ids.creditAppliedPaymentId,
        ids.creditUsedPaymentId,
      ].filter((id): id is number => id !== null);
      await executeStatement(
        queryRunner,
        `DELETE FROM payment WHERE id IN (${paymentIds.map(() => '?').join(',')})`,
        paymentIds,
      );

      const transactionIds = [
        ids.accountEntryTransactionId,
        ids.creditAppliedTransactionId,
        ids.creditUsedTransactionId,
      ].filter((id): id is number => id !== null);
      await executeStatement(
        queryRunner,
        `DELETE FROM \`transaction\` WHERE id IN (${transactionIds.map(() => '?').join(',')})`,
        transactionIds,
      );
    }

    for (const snapshot of before) {
      await executeStatement(
        queryRunner,
        `UPDATE private_lesson SET balance = ? WHERE id = ? AND balance = 0.0000`,
        [
          (snapshot.lessonBalanceCents / 100).toFixed(4),
          snapshot.privateLessonId,
        ],
      );
      for (const invoice of snapshot.invoices) {
        await executeStatement(
          queryRunner,
          `
            UPDATE invoice
            SET balance = ?, status = ?, updatedOn = ?, updatedUserId = ?
            WHERE id = ? AND balance = 0.0000
          `,
          [
            (invoice.balanceCents / 100).toFixed(4),
            invoice.status,
            invoice.updatedOn,
            invoice.updatedUserId,
            invoice.id,
          ],
        );
      }
    }

    const restored = await inspectCases(queryRunner);
    if (hash(restored) !== hash(before)) fail('rollback postcondition failed');
    await executeStatement(
      queryRunner,
      `
        UPDATE \`${JOURNAL_TABLE}\`
        SET state = 'reverted', updatedAt = CURRENT_TIMESTAMP
        WHERE migrationName = ?
      `,
      [this.name],
    );
  }
}
