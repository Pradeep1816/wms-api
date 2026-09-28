import { RepairAuditedPrepaidLessonInvoices1789077600000 as Repair } from '../1789077600000-RepairAuditedPrepaidLessonInvoices';

function fixture() {
  const s: Record<string, any[]> = Object.fromEntries(
    [
      'invoice',
      'invoice_line_item',
      'invoice_line_item_discount',
      'invoice_item_lesson',
      'invoice_payment',
      'payment',
      'lesson',
      'private_lesson',
      'lesson_discount',
      'lesson_payment',
      'customer_account',
      'calculated_balance',
    ].map((k) => [k, []]),
  );
  for (const c of Repair.cases) {
    const unpaid = [1172433, 1171295, 1173301].includes(c.invoice);
    const gross = c.invoice === 1172443 ? 36.25 : c.old;
    s.invoice.push({
      id: c.invoice,
      user_id: c.customer,
      location_id: c.location,
      type: 2,
      isDeleted: 0,
      isCanceled: 0,
      isVoid: 0,
      isTaxAdjusted: 0,
      tax: '0.0000',
      total: c.old.toFixed(4),
      subTotal: c.old.toFixed(4),
      balance: (unpaid ? c.old : c.old - c.expected).toFixed(4),
      status: 1,
      totalCopy: c.old.toFixed(4),
      paidStatus: 1,
    });
    s.invoice_line_item.push({
      id: c.line,
      invoice_id: c.invoice,
      isDeleted: 0,
      netTotal: c.old.toFixed(4),
      amount: (gross * 2).toFixed(4),
      unit: 0.5,
      tax_rate: '0.0000',
    });
    s.invoice_item_lesson.push({
      id: c.line,
      invoiceLineItemId: c.line,
      lessonId: c.lesson,
    });
    s.invoice_line_item_discount.push({
      id: c.line,
      invoiceLineItemId: c.line,
      type: 7,
      valueType: 0,
      value: c.prepaid.toFixed(4),
    });
    if (c.invoice === 1172443)
      s.invoice_line_item_discount.push({
        id: c.line + 100,
        invoiceLineItemId: c.line,
        type: 4,
        valueType: 0,
        value: '1.0900',
      });
    s.lesson.push({
      id: c.lesson,
      isDeleted: 0,
      isConfirmed: 1,
      isExploded: 0,
      status: 2,
      duration: '00:30:00',
      programRate: (gross * 2).toFixed(4),
    });
    s.private_lesson.push({
      id: c.lesson,
      lessonId: c.lesson,
      total: c.expected.toFixed(4),
      balance: unpaid ? c.expected.toFixed(4) : '0.0000',
    });
    s.lesson_discount.push({
      id: c.lesson,
      lessonId: c.lesson,
      type: 7,
      valueType: 0,
      value: c.prepaid.toFixed(4),
    });
    if (!unpaid) {
      s.invoice_payment.push({
        id: c.invoice,
        invoice_id: c.invoice,
        payment_id: c.invoice,
        isDeleted: 0,
        amount: c.expected.toFixed(4),
      });
      s.payment.push({ id: c.invoice, isDeleted: 0, balance: '0.0000' });
    }
    if (!s.customer_account.some((r) => r.customerId === c.customer))
      s.customer_account.push({
        id: c.customer,
        customerId: c.customer,
        balance: '100.0000',
      });
  }
  s.calculated_balance = s.customer_account.map((r) => ({
    customerId: r.customerId,
    balance: '100.0000',
  }));
  return s;
}

describe('audited prepaid invoice repair', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(['development', 'dev', 'test', ' Development '])(
    'skips the production manifest on explicit %s deployments before any database access',
    async (target) => {
      vi.stubEnv('APP_ENV', target);
      const log = vi.spyOn(console, 'info').mockImplementation(() => {});
      const query = vi.fn();
      const createQueryRunner = vi.fn();
      await new Repair().up({
        query,
        connection: { createQueryRunner },
      } as any);
      expect(query).not.toHaveBeenCalled();
      expect(createQueryRunner).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(
          'Skipping audited production prepaid invoice repair',
        ),
      );
    },
  );

  it.each(['production', 'prod', 'staging', '', undefined])(
    'retains the guarded repair path for APP_ENV=%s',
    async (target) => {
      vi.stubEnv('APP_ENV', target);
      const migration = new Repair();
      const refusal = new Error(
        'Prepaid invoice repair refused: identity changed',
      );
      const apply = vi
        .spyOn(migration as any, 'apply')
        .mockRejectedValue(refusal);
      const journal = { connect: vi.fn(), release: vi.fn() };
      const queryRunner = {
        connection: { createQueryRunner: vi.fn().mockReturnValue(journal) },
      } as any;
      await expect(migration.up(queryRunner)).rejects.toThrow(refusal);
      expect(apply).toHaveBeenCalledWith(queryRunner, journal);
      expect(journal.release).toHaveBeenCalledOnce();
    },
  );

  it('corrects nine invoices by $10.80 while retaining payments, lesson totals and manual discounts', () => {
    const before = fixture();
    const changes = Repair.plan(before);
    expect(changes.filter((c) => c.table === 'invoice')).toHaveLength(9);
    const after = Repair.expectedSnapshot(before, changes);
    expect(
      after.invoice.reduce(
        (sum, r) => sum + Math.round(Number(r.total) * 100),
        0,
      ),
    ).toBe(
      before.invoice.reduce(
        (sum, r) => sum + Math.round(Number(r.total) * 100),
        0,
      ) - 1080,
    );
    expect(after.invoice.filter((r) => Number(r.balance) === 0)).toHaveLength(
      6,
    );
    for (const table of [
      'payment',
      'invoice_payment',
      'lesson_payment',
      'lesson',
      'private_lesson',
      'lesson_discount',
      'invoice_line_item_discount',
    ]) {
      expect(after[table]).toEqual(before[table]);
    }
    expect(Repair.plan(after)).toEqual([]);
  });

  it('includes the additional unpaid Richmond Hill invoice from the September 11 dump', () => {
    const before = fixture();
    const after = Repair.expectedSnapshot(before, Repair.plan(before));
    expect(after.invoice.find((row) => row.id === 1173301)).toMatchObject({
      total: '35.1600',
      balance: '35.1600',
      status: 1,
      paidStatus: 1,
    });
    expect(
      after.customer_account.find((row) => row.customerId === 13366)?.balance,
    ).toBe('97.8200');
    expect(after.invoice_payment).toEqual(before.invoice_payment);
  });

  it('is a no-op on a database without the audited invoices', () => {
    const s = fixture();
    s.invoice = [];
    expect(Repair.plan(s)).toEqual([]);
  });

  it('recalculates a stale zero cache instead of creating a false credit', () => {
    const s = fixture();
    s.customer_account[0].balance = '0.0000';
    s.calculated_balance[0].balance = '1.0900';
    const after = Repair.expectedSnapshot(s, Repair.plan(s));
    expect(after.customer_account[0].balance).toBe('0.0000');
  });

  it('refuses a payment that would require creating a new overpayment credit', () => {
    const s = fixture();
    s.invoice_payment[0].amount = s.invoice[0].total;
    s.invoice[0].balance = '0.0000';
    expect(() => Repair.plan(s)).toThrow(/credit\/refund review/);
  });

  it.each(['identity', 'discount', 'balance', 'tax', 'canceled'])(
    'refuses drift in %s before changing any invoice',
    (kind) => {
      const s = fixture();
      if (kind === 'identity') s.invoice[0].user_id++;
      if (kind === 'discount') s.invoice_line_item_discount[0].value = '2.0000';
      if (kind === 'balance') s.invoice[0].balance = '99.0000';
      if (kind === 'tax') s.invoice[0].tax = '1.0000';
      if (kind === 'canceled') s.lesson[0].status = 4;
      expect(() => Repair.plan(s)).toThrow(/repair refused/);
    },
  );

  it('allows recovery after a partial write but refuses a subsequent payment', () => {
    const before = fixture();
    const changes = Repair.plan(before);
    const partial = Repair.expectedSnapshot(before, changes.slice(0, 3));
    expect(() =>
      Repair.assertResumable(partial, before, changes),
    ).not.toThrow();
    partial.invoice_payment.push({
      id: 999,
      invoice_id: Repair.cases[0].invoice,
      amount: '1.0000',
    });
    expect(() => Repair.assertResumable(partial, before, changes)).toThrow(
      /snapshot changed/,
    );
  });

  it('refuses rollback after a customer balance changes', () => {
    const before = fixture();
    const changes = Repair.plan(before);
    const after = Repair.expectedSnapshot(before, changes);
    after.customer_account[0].balance = '1000.0000';
    expect(() => Repair.assertResumable(after, before, changes)).toThrow(
      /changed outside/,
    );
  });
});
