import { RepairVerifiedHistoricalCentResiduals1791100000000 as Repair } from '../1791100000000-RepairVerifiedHistoricalCentResiduals';

function fixture() {
  return Repair.cases.map((repairCase, index) => {
    const invoice =
      repairCase.invoiceId === null
        ? []
        : [
            {
              id: repairCase.invoiceId,
              invoiceNumber: repairCase.invoiceNumber,
              customerId: repairCase.customerId,
              locationId: repairCase.locationId,
              totalCents: repairCase.lessonTotalCents,
              balanceCents: repairCase.repairInvoice ? 1 : 0,
              status: repairCase.invoiceStatus,
              paidStatus: 0,
              isDeleted: 0,
              isCanceled: 0,
              isVoid: 0,
              updatedOn: '2026-09-18 00:00:00',
              updatedUserId: 727,
              allocations: [
                {
                  id: 20_000 + index,
                  paymentId: 30_000 + index,
                  enrolmentId: null,
                  amountCents:
                    repairCase.lessonTotalCents -
                    (repairCase.repairInvoice ? 1 : 0),
                  isDeleted: 0,
                  paymentMethodId: 8,
                  paymentIsDeleted: 0,
                },
              ],
              paidCents:
                repairCase.lessonTotalCents -
                (repairCase.repairInvoice ? 1 : 0),
            },
          ];

    return {
      lessonId: repairCase.lessonId,
      locationId: repairCase.locationId,
      customerId: repairCase.customerId,
      enrolmentId: repairCase.enrolmentId,
      lessonIsDeleted: 0,
      privateLessonId: 10_000 + index,
      lessonTotalCents: repairCase.lessonTotalCents,
      lessonBalanceCents: 1,
      lessonAllocations: [
        {
          id: 40_000 + index,
          paymentId: 50_000 + index,
          enrolmentId: repairCase.enrolmentId,
          amountCents: repairCase.lessonTotalCents - 1,
          isDeleted: 0,
          paymentMethodId: 8,
          paymentIsDeleted: 0,
        },
      ],
      activeNonCreditPaidCents: repairCase.lessonTotalCents - 1,
      invoices: invoice,
    };
  });
}

function appliedFixture() {
  const before = fixture();
  const after = structuredClone(before);
  const generated: Parameters<typeof Repair.assertPostconditions>[2] = [];

  Repair.cases.forEach((repairCase, index) => {
    const snapshot = after[index];
    const base = 100_000 + index * 20;
    snapshot.lessonBalanceCents = 0;
    snapshot.activeNonCreditPaidCents += 1;
    snapshot.lessonAllocations.push({
      id: base + 3,
      paymentId: base + 2,
      enrolmentId: repairCase.enrolmentId,
      amountCents: 1,
      isDeleted: 0,
      paymentMethodId: 1,
      paymentIsDeleted: 0,
    });

    const ids = {
      lessonId: repairCase.lessonId,
      accountEntryTransactionId: base + 1,
      accountEntryPaymentId: base + 2,
      accountEntryLessonPaymentId: base + 3,
      creditAppliedTransactionId: null,
      creditAppliedPaymentId: null,
      invoicePaymentId: null,
      creditUsedTransactionId: null,
      creditUsedPaymentId: null,
      creditUsedLessonPaymentId: null,
      creditUsageId: null,
    };

    if (repairCase.repairInvoice) {
      ids.creditAppliedTransactionId = base + 4;
      ids.creditAppliedPaymentId = base + 5;
      ids.invoicePaymentId = base + 6;
      ids.creditUsedTransactionId = base + 7;
      ids.creditUsedPaymentId = base + 8;
      ids.creditUsedLessonPaymentId = base + 9;
      ids.creditUsageId = base + 10;
      snapshot.lessonAllocations.push({
        id: base + 9,
        paymentId: base + 8,
        enrolmentId: repairCase.enrolmentId,
        amountCents: -1,
        isDeleted: 0,
        paymentMethodId: 2,
        paymentIsDeleted: 0,
      });
      const invoice = snapshot.invoices[0];
      invoice.allocations.push({
        id: base + 6,
        paymentId: base + 5,
        enrolmentId: null,
        amountCents: 1,
        isDeleted: 0,
        paymentMethodId: 3,
        paymentIsDeleted: 0,
      });
      invoice.paidCents += 1;
      invoice.balanceCents = 0;
      invoice.status = 2;
      invoice.updatedOn = '2026-09-18 12:00:00';
      invoice.updatedUserId = 727;
    }
    generated.push(ids);
  });

  return { before, after, generated };
}

describe('verified historical cent residual repair', () => {
  it('contains exactly the 23 reviewed lessons and 16 invoice transfers', () => {
    expect(Repair.cases).toHaveLength(23);
    expect(Repair.cases.filter((row) => row.repairInvoice)).toHaveLength(16);
    expect(new Set(Repair.cases.map((row) => row.lessonId)).size).toBe(23);
  });

  it('treats the already-paid invoice on lesson 5206911 as lesson-only', () => {
    expect(Repair.cases.find((row) => row.lessonId === 5206911)).toMatchObject({
      invoiceId: 1138613,
      repairInvoice: false,
      invoiceStatus: 2,
    });
    expect(Repair.plan(fixture())).toHaveLength(23);
  });

  it('accepts only the exact reviewed pre-repair state', () => {
    const snapshots = fixture();
    expect(Repair.plan(snapshots)).toHaveLength(23);

    snapshots[0].lessonBalanceCents = 0;
    expect(() => Repair.plan(snapshots)).toThrow(/identity or balance changed/);
  });

  it('refuses a partial production dataset instead of applying a partial repair', () => {
    expect(() => Repair.plan(fixture().slice(0, 22))).toThrow(/found 22 of 23/);
  });

  it('refuses changed invoice payment state', () => {
    const snapshots = fixture();
    snapshots[0].invoices[0].paidCents += 1;
    expect(() => Repair.plan(snapshots)).toThrow(
      /invoice 1082655 identity or balance changed/,
    );
  });

  it('is a no-op on a database without the production lesson IDs', () => {
    expect(Repair.plan([])).toEqual([]);
  });

  it('accepts the exact post-repair ledger while preserving original rows', () => {
    const { before, after, generated } = appliedFixture();
    expect(() =>
      Repair.assertPostconditions(after, before, generated),
    ).not.toThrow();
  });

  it('refuses a post-repair ledger when an original allocation changed', () => {
    const { before, after, generated } = appliedFixture();
    after[0].lessonAllocations[0].amountCents -= 1;
    expect(() => Repair.assertPostconditions(after, before, generated)).toThrow(
      /original lesson, invoice, or allocation changed/,
    );
  });
});
