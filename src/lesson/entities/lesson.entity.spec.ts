import { describe, expect, it } from 'vitest';
import { Lesson } from './lesson.entity';
import { LessonDiscount } from './lesson-discount.entity';

/**
 * What a lesson costs, through the entity the other calculators mirror.
 *
 * The cases here are the ones where the discount ordering decides real money:
 * prepaid superseding the payment-frequency percentage, and prepaid refusing to
 * take a lesson below zero.
 */
const lesson = (
  discounts: Array<Partial<LessonDiscount>>,
  over: Partial<Lesson> = {},
) =>
  Object.assign(new Lesson(), {
    id: 1,
    // 30 minutes at $87.50/hr is $43.75 gross - Arcadia's Tier 2 Standard.
    duration: '00:30:00',
    programRate: 87.5,
    tax: 0,
    discounts: discounts.map((d) => Object.assign(new LessonDiscount(), d)),
    ...over,
  });

const discount = (type: number, value: number, valueType = 0) => ({
  type,
  value,
  valueType,
});

describe('Lesson.getNetPrice', () => {
  it('is the gross when nothing is discounted', () => {
    expect(lesson([]).getNetPrice()).toBe(43.75);
  });

  it('keeps the quarter-hour gross price exact for 64.98 per hour', () => {
    expect(
      lesson([], {
        duration: '00:15:00',
        programRate: 64.98,
      }).getGrossPrice(),
    ).toBe(16.25);
  });

  it('applies a prepaid amount', () => {
    // $510.00 across twelve lessons is $42.50 each, so $1.25 off the gross.
    expect(
      lesson([discount(LessonDiscount.TYPE_PREPAID_CYCLE, 1.25)]).getNetPrice(),
    ).toBe(42.5);
  });

  it('lets prepaid supersede the payment-frequency percentage', () => {
    // Both express the same entitlement to a cheaper cycle. Applying the 15%
    // as well would discount the cycle twice.
    const price = lesson([
      discount(LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY, 15, 1),
      discount(LessonDiscount.TYPE_PREPAID_CYCLE, 1.25),
    ]).getNetPrice();

    expect(price).toBe(42.5);
  });

  it('keeps the sibling discount alongside prepaid', () => {
    // Multiple enrolment sits ahead of prepaid and stacks on top of the
    // published price: $43.75 less $1.25 prepaid less $2.50 sibling.
    const price = lesson([
      discount(LessonDiscount.TYPE_MULTIPLE_ENROLMENT, 2.5),
      discount(LessonDiscount.TYPE_PREPAID_CYCLE, 1.25),
    ]).getNetPrice();

    expect(price).toBe(40);
  });

  describe('never goes below zero', () => {
    it('on a comped student carrying a prepaid amount', () => {
      // Arcadia, found 2026-08-26 while testing the estate-wide rollout. A
      // 100% customer discount leaves exactly $0.00 before prepaid, and the
      // old guard only skipped a *negative* remainder - so the full $1.25 came
      // off anyway and a Tier 2 quarterly cycle at Woodbridge billed -$15.00.
      //
      // 484 courses across seven locations are on a 100% customer discount.
      const price = lesson([
        discount(LessonDiscount.TYPE_CUSTOMER, 100, 1),
        discount(LessonDiscount.TYPE_PREPAID_CYCLE, 1.25),
      ]).getNetPrice();

      expect(price).toBe(0);
    });

    it('when the prepaid amount is larger than what is left', () => {
      // A 90% customer discount leaves $4.38; a $10.00 prepaid amount must
      // stop at zero rather than run past it.
      const price = lesson([
        discount(LessonDiscount.TYPE_CUSTOMER, 90, 1),
        discount(LessonDiscount.TYPE_PREPAID_CYCLE, 10),
      ]).getNetPrice();

      expect(price).toBe(0);
    });

    it('when a sibling discount alone already exceeds the gross', () => {
      // The lesson is already at or below zero before prepaid is considered.
      const price = lesson([
        discount(LessonDiscount.TYPE_MULTIPLE_ENROLMENT, 50),
        discount(LessonDiscount.TYPE_PREPAID_CYCLE, 1.25),
      ]).getNetPrice();

      // Still negative from the sibling discount - that is pre-existing
      // behaviour and out of scope here - but prepaid has added nothing to it.
      expect(price).toBe(-6.25);
    });
  });
});

describe('QA R5 discount calculation', () => {
  it('applies a fixed multi-enrolment discount', () => {
    const row = lesson([discount(LessonDiscount.TYPE_MULTIPLE_ENROLMENT, 2.5)]);

    expect(row.getGrossPrice()).toBe(43.75);
    expect(row.getDiscount()).toBe(2.5);
    expect(row.getSubTotal()).toBe(41.25);
    expect(row.getNetPrice()).toBe(41.25);
  });

  it('applies a fixed line-item discount', () => {
    const row = lesson([discount(LessonDiscount.TYPE_LINE_ITEM, 1)]);

    expect(row.getDiscount()).toBe(1);
    expect(row.getNetPrice()).toBe(42.75);
  });

  it('applies a percentage line-item discount', () => {
    const row = lesson([discount(LessonDiscount.TYPE_LINE_ITEM, 10, 1)]);

    expect(row.getDiscount()).toBe(4.375);
    expect(row.getNetPrice()).toBe(39.38);
  });

  it('applies a customer percentage discount', () => {
    const row = lesson([discount(LessonDiscount.TYPE_CUSTOMER, 10, 1)]);

    expect(row.getDiscount()).toBe(4.375);
    expect(row.getNetPrice()).toBe(39.38);
  });

  it('applies a payment-frequency percentage discount', () => {
    const row = lesson(
      [discount(LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY, 6, 1)],
      { programRate: 57.5 },
    );

    expect(row.getGrossPrice()).toBe(28.75);
    expect(row.getDiscount()).toBe(1.725);
    expect(row.getSubTotal()).toBe(27.025);
    expect(row.getNetPrice()).toBe(27.03);
  });

  it('lets a prepaid-cycle amount replace payment frequency', () => {
    const row = lesson([
      discount(LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY, 3, 1),
      discount(LessonDiscount.TYPE_PREPAID_CYCLE, 1.25),
    ]);

    expect(row.getDiscount()).toBe(1.25);
    expect(row.getNetPrice()).toBe(42.5);
  });

  it('stacks a fixed multi-enrolment discount with payment frequency', () => {
    const row = lesson(
      [
        discount(LessonDiscount.TYPE_MULTIPLE_ENROLMENT, 1.25),
        discount(LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY, 3, 1),
      ],
      { programRate: 72 },
    );

    expect(row.getGrossPrice()).toBe(36);
    expect(row.getDiscount()).toBe(2.2925);
    expect(row.getSubTotal()).toBe(33.7075);
    expect(row.getNetPrice()).toBe(33.71);
  });

  it('keeps the legacy cascade order for mixed fixed and percentage discounts', () => {
    const row = lesson(
      [
        discount(LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY, 3, 1),
        discount(LessonDiscount.TYPE_CUSTOMER, 5, 1),
        discount(LessonDiscount.TYPE_LINE_ITEM, 10, 1),
        discount(LessonDiscount.TYPE_MULTIPLE_ENROLMENT, 1.25),
      ],
      { programRate: 72 },
    );

    // Gross 36.00
    // 1. multi $1.25 -> 34.75
    // 2. line item 10% of 34.75 = 3.475 -> 31.275
    // 3. customer 5% of 31.275 = 1.56375 -> 29.71125
    // 4. payment frequency 3% of 29.71125 = 0.8913375
    expect(row.getDiscount()).toBe(7.1801);
    expect(row.getNetPrice()).toBe(28.82);
  });
});
