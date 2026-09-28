import { describe, expect, it } from 'vitest';
import { calculateRecurringPaymentEnrolmentAmount } from './recurring-payment-enrolment-amount.helper';

describe('calculateRecurringPaymentEnrolmentAmount', () => {
  it('includes monthly multiple-enrolment discounts in the recurring total', () => {
    const amounts = [
      calculateRecurringPaymentEnrolmentAmount({
        grossAmount: '130.00',
        paymentFrequencyId: 1,
        paymentFrequencyDiscount: null,
        paymentFrequencyDiscountType: null,
        multipleEnrolmentDiscount: null,
        multipleEnrolmentDiscountType: null,
      }),
      calculateRecurringPaymentEnrolmentAmount({
        grossAmount: '130.00',
        paymentFrequencyId: 1,
        paymentFrequencyDiscount: null,
        paymentFrequencyDiscountType: null,
        multipleEnrolmentDiscount: 5,
        multipleEnrolmentDiscountType: 1,
      }),
      calculateRecurringPaymentEnrolmentAmount({
        grossAmount: '145.00',
        paymentFrequencyId: 1,
        paymentFrequencyDiscount: null,
        paymentFrequencyDiscountType: null,
        multipleEnrolmentDiscount: 5,
        multipleEnrolmentDiscountType: 1,
      }),
    ];

    expect(amounts).toEqual([130, 125, 140]);
    expect(amounts.reduce((total, amount) => total + amount, 0)).toBe(395);
  });

  it('applies the multiple-enrolment discount before the payment-frequency percentage', () => {
    expect(
      calculateRecurringPaymentEnrolmentAmount({
        grossAmount: 200,
        paymentFrequencyId: 1,
        paymentFrequencyDiscount: 10,
        paymentFrequencyDiscountType: 0,
        multipleEnrolmentDiscount: 5,
        multipleEnrolmentDiscountType: 1,
      }),
    ).toBe(175.52);

    expect(
      calculateRecurringPaymentEnrolmentAmount({
        grossAmount: 130,
        paymentFrequencyId: 1,
        paymentFrequencyDiscount: 4,
        paymentFrequencyDiscountType: 0,
        multipleEnrolmentDiscount: 8,
        multipleEnrolmentDiscountType: 1,
      }),
    ).toBe(117.12);

    expect(
      calculateRecurringPaymentEnrolmentAmount({
        grossAmount: 260,
        paymentFrequencyId: 2,
        paymentFrequencyDiscount: 4,
        paymentFrequencyDiscountType: 0,
        multipleEnrolmentDiscount: 8,
        multipleEnrolmentDiscountType: 1,
      }),
    ).toBe(234.24);
  });

  it('applies fixed payment-frequency discounts across the cycle', () => {
    expect(
      calculateRecurringPaymentEnrolmentAmount({
        grossAmount: 200,
        paymentFrequencyId: 2,
        paymentFrequencyDiscount: 2,
        paymentFrequencyDiscountType: 1,
        multipleEnrolmentDiscount: null,
        multipleEnrolmentDiscountType: null,
      }),
    ).toBe(184);
  });

  it('spreads a percentage multiple-enrolment discount over four lessons', () => {
    expect(
      calculateRecurringPaymentEnrolmentAmount({
        grossAmount: 200,
        paymentFrequencyId: 1,
        paymentFrequencyDiscount: null,
        paymentFrequencyDiscountType: null,
        multipleEnrolmentDiscount: 20,
        multipleEnrolmentDiscountType: 0,
      }),
    ).toBe(190);
  });

  it('uses the system half-up rule at a half-cent boundary', () => {
    expect(
      calculateRecurringPaymentEnrolmentAmount({
        grossAmount: '6.90',
        paymentFrequencyId: 1,
        paymentFrequencyDiscount: null,
        paymentFrequencyDiscountType: null,
        multipleEnrolmentDiscount: null,
        multipleEnrolmentDiscountType: null,
      }),
    ).toBe(6.92);
  });

  it('matches the sum of individually rounded lesson balances', () => {
    expect(
      calculateRecurringPaymentEnrolmentAmount({
        grossAmount: '145.00',
        paymentFrequencyId: 1,
        paymentFrequencyDiscount: 3,
        paymentFrequencyDiscountType: 0,
        multipleEnrolmentDiscount: null,
        multipleEnrolmentDiscountType: null,
      }),
    ).toBe(140.64);
  });

  it('rounds the gross lesson price before applying its discount', () => {
    expect(
      calculateRecurringPaymentEnrolmentAmount({
        grossAmount: '172.50',
        paymentFrequencyId: 1,
        paymentFrequencyDiscount: 3,
        paymentFrequencyDiscountType: 0,
        multipleEnrolmentDiscount: null,
        multipleEnrolmentDiscountType: null,
      }),
    ).toBe(167.36);
  });
});
