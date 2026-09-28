/**
 * Calculate the billing due date for a payment cycle.
 *
 * A cycle is due on the 15th of the month before its billing basis month. The
 * basis is the later of the cycle start month and the earliest linked billing
 * occurrence month. This prevents an earlier `originalDate` from pulling a
 * cycle forward while avoiding a charge before a later first occurrence.
 */
export function calculatePaymentCycleDueDate(
  cycleStartDate: Date | string,
  linkedBillingOccurrenceDates: readonly (Date | string)[] = [],
): Date {
  const cycleStart = extractUtcDateParts(cycleStartDate);
  const earliestOccurrence = linkedBillingOccurrenceDates.reduce<{
    year: number;
    monthIndex: number;
  } | null>((earliest, value) => {
    const current = extractUtcDateParts(value);
    if (!earliest || toMonthNumber(current) < toMonthNumber(earliest)) {
      return current;
    }
    return earliest;
  }, null);
  const billingBasis =
    earliestOccurrence &&
    toMonthNumber(earliestOccurrence) > toMonthNumber(cycleStart)
      ? earliestOccurrence
      : cycleStart;

  return new Date(
    Date.UTC(billingBasis.year, billingBasis.monthIndex - 1, 15),
  );
}

function toMonthNumber(value: { year: number; monthIndex: number }): number {
  return value.year * 12 + value.monthIndex;
}

function extractUtcDateParts(value: Date | string): {
  year: number;
  monthIndex: number;
} {
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (match) {
      const monthIndex = Number(match[2]) - 1;
      if (monthIndex >= 0 && monthIndex <= 11) {
        return {
          year: Number(match[1]),
          monthIndex,
        };
      }
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid payment-cycle start date: ${String(value)}`);
  }

  return {
    year: date.getUTCFullYear(),
    monthIndex: date.getUTCMonth(),
  };
}
