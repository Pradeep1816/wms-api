import BigNumber from 'bignumber.js';
import { RoundingUtils } from '../../utils/rounding.utils';

interface RecurringPaymentEnrolmentAmountInput {
  grossAmount: number | string | null | undefined;
  paymentFrequencyId: number | string | null | undefined;
  paymentFrequencyDiscount: number | string | null | undefined;
  paymentFrequencyDiscountType: number | string | null | undefined;
  multipleEnrolmentDiscount: number | string | null | undefined;
  multipleEnrolmentDiscountType: number | string | null | undefined;
}

const VALUE_TYPE_PERCENTAGE = 0;
const LESSONS_PER_MONTH = 4;

function toNonNegativeDecimal(
  value: number | string | null | undefined,
): BigNumber {
  const parsed = RoundingUtils.decimal(value ?? 0);
  return parsed.isGreaterThan(0) ? parsed : RoundingUtils.decimal(0);
}

/**
 * Calculate the amount represented by an enrolment in the recurring-payment
 * form. Payment-frequency dollar discounts are per lesson, while the multiple-
 * enrolment dollar discount is a monthly amount divided over four lessons.
 * Multiple-enrolment discounts are applied before payment-frequency discounts,
 * matching lesson billing and the legacy calculation order. Gross and net
 * amounts are rounded per lesson before the cycle total is produced so the
 * recurring amount matches the sum of the stored lesson balances.
 */
export function calculateRecurringPaymentEnrolmentAmount(
  input: RecurringPaymentEnrolmentAmountInput,
): number {
  const grossAmount = toNonNegativeDecimal(input.grossAmount);
  const frequencyLength = Math.max(
    1,
    Math.floor(toNonNegativeDecimal(input.paymentFrequencyId).toNumber()),
  );
  const lessonsInCycle = frequencyLength * LESSONS_PER_MONTH;
  const grossAmountPerLesson = RoundingUtils.decimal(
    RoundingUtils.roundDecimal(grossAmount.dividedBy(lessonsInCycle), 2),
  );

  const multipleEnrolmentDiscount = toNonNegativeDecimal(
    input.multipleEnrolmentDiscount,
  );
  const multipleEnrolmentDiscountPerLesson =
    Number(input.multipleEnrolmentDiscountType) === VALUE_TYPE_PERCENTAGE
      ? grossAmountPerLesson
          .multipliedBy(multipleEnrolmentDiscount)
          .dividedBy(LESSONS_PER_MONTH * 100)
      : multipleEnrolmentDiscount.dividedBy(LESSONS_PER_MONTH);

  const amountPerLessonAfterMultipleEnrolmentDiscount = BigNumber.max(
    0,
    grossAmountPerLesson.minus(multipleEnrolmentDiscountPerLesson),
  );

  const paymentFrequencyDiscount = toNonNegativeDecimal(
    input.paymentFrequencyDiscount,
  );
  const paymentFrequencyDiscountAmount =
    Number(input.paymentFrequencyDiscountType) === VALUE_TYPE_PERCENTAGE
      ? amountPerLessonAfterMultipleEnrolmentDiscount
          .multipliedBy(paymentFrequencyDiscount)
          .dividedBy(100)
      : paymentFrequencyDiscount;

  const netAmountPerLesson = BigNumber.max(
    0,
    amountPerLessonAfterMultipleEnrolmentDiscount.minus(
      paymentFrequencyDiscountAmount,
    ),
  );
  const roundedNetAmountPerLesson = RoundingUtils.decimal(
    RoundingUtils.roundDecimal(netAmountPerLesson, 2),
  );

  return RoundingUtils.roundDecimal(
    roundedNetAmountPerLesson.multipliedBy(lessonsInCycle),
    2,
  );
}
