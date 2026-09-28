import { CustomerRecurringPayment } from '../entities/customer-recurring-payment.entity';

export function serializeRecurringPaymentForAudit(
  recurringPayment: CustomerRecurringPayment,
): Record<string, unknown> {
  return {
    id: recurringPayment.id,
    customerId: recurringPayment.customerId,
    entryDay: recurringPayment.entryDay,
    paymentDay: recurringPayment.paymentDay,
    paymentMethodId: recurringPayment.paymentMethodId,
    paymentFrequencyId: recurringPayment.paymentFrequencyId,
    expiryDate: recurringPayment.expiryDate,
    amount: recurringPayment.amount,
    isDeleted: recurringPayment.isDeleted,
    createdOn: recurringPayment.createdOn,
    updatedOn: recurringPayment.updatedOn,
    createdByUserId: recurringPayment.createdByUserId,
    updatedByUserId: recurringPayment.updatedByUserId,
    isRecurringPaymentEnabled: recurringPayment.isRecurringPaymentEnabled,
    startDate: recurringPayment.startDate,
    nextEntryDay: recurringPayment.nextEntryDay,
  };
}

type RecurringPaymentAuditSnapshot = Record<string, unknown>;

export function buildRecurringPaymentAuditDiff(
  before: RecurringPaymentAuditSnapshot,
  after: RecurringPaymentAuditSnapshot,
  beforeEnrolmentIds: number[] = [],
  afterEnrolmentIds: number[] = [],
): Record<string, unknown> {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  const ignoredKeys = new Set(['createdOn', 'updatedOn']);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of keys) {
    if (ignoredKeys.has(key)) {
      continue;
    }

    const beforeValue = normalizeAuditValue(before[key]);
    const afterValue = normalizeAuditValue(after[key]);

    if (!valuesEqual(beforeValue, afterValue)) {
      changes[key] = {
        before: beforeValue,
        after: afterValue,
      };
    }
  }

  const normalizedBeforeEnrolmentIds = normalizeIdList(beforeEnrolmentIds);
  const normalizedAfterEnrolmentIds = normalizeIdList(afterEnrolmentIds);

  if (!valuesEqual(normalizedBeforeEnrolmentIds, normalizedAfterEnrolmentIds)) {
    changes.enrolmentIds = {
      before: normalizedBeforeEnrolmentIds,
      after: normalizedAfterEnrolmentIds,
    };
  }

  return {
    before: {
      recurringPayment: before,
      enrolmentIds: normalizedBeforeEnrolmentIds,
    },
    after: {
      recurringPayment: after,
      enrolmentIds: normalizedAfterEnrolmentIds,
    },
    changes,
  };
}

function normalizeAuditValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

function normalizeIdList(ids: number[]): number[] {
  return [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)))].sort(
    (a, b) => a - b,
  );
}

function valuesEqual(before: unknown, after: unknown): boolean {
  return JSON.stringify(before) === JSON.stringify(after);
}
