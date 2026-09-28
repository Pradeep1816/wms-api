import { PrivateLessonInvoiceService } from './generate-invoice.service';
import * as dateUtils from '../../utils/date-utils';
import { LessonStatusEnum } from '../enums/lesson-status';
import { InvoiceLineItemDiscount } from '../../invoice/entities/invoice-line-item-discount.entity';
import { Lesson } from '../entities/lesson.entity';

describe('PrivateLessonInvoiceService.canInvoice', () => {
  let service: PrivateLessonInvoiceService;

  beforeEach(() => {
    service = new PrivateLessonInvoiceService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses EST current time when deciding whether a scheduled lesson is completed', () => {
    vi.spyOn(dateUtils, 'getCurrentESTDate').mockReturnValue(
      new Date('2026-05-14T23:00:00.000Z'),
    );

    const lesson = {
      isDeleted: false,
      isConfirmed: true,
      status: LessonStatusEnum.SCHEDULED,
      date: new Date('2026-05-14T22:30:00.000Z'),
      isPresent: true,
      privateLesson: [{ expiryDate: new Date('2026-05-20T00:00:00.000Z') }],
    } as any;

    expect(service.canInvoice(lesson)).toBe(true);
  });

  it('uses EST current time when deciding whether an unscheduled private lesson is expired', () => {
    vi.spyOn(dateUtils, 'getCurrentESTDate').mockReturnValue(
      new Date('2026-05-15T02:00:00.000Z'),
    );

    const lesson = {
      isDeleted: false,
      isConfirmed: true,
      status: LessonStatusEnum.UNSCHEDULED,
      date: new Date('2026-05-10T10:00:00.000Z'),
      isPresent: true,
      privateLesson: [{ expiryDate: new Date('2026-05-15T01:00:00.000Z') }],
    } as any;

    expect(service.canInvoice(lesson)).toBe(true);
  });
});

describe('PrivateLessonInvoiceService invoice rounding', () => {
  let service: PrivateLessonInvoiceService;

  beforeEach(() => {
    service = new PrivateLessonInvoiceService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('rounds the final private lesson net total instead of rounding the discount first', () => {
    const netTotal = (service as any).computeDiscountedNetTotal(32.5, [
      {
        type: InvoiceLineItemDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
        value: 3,
        valueType: InvoiceLineItemDiscount.VALUE_TYPE_PERCENTAGE,
      },
    ]);

    expect(netTotal).toBe(31.53);
  });

  it.each([
    [36.25, 1.09, 35.16],
    [36.25, 1.8, 34.45],
    [36.25, 2.9, 33.35],
    [43.75, 1.25, 42.5],
    [43.75, 2.17, 41.58],
    [43.75, 3.5, 40.25],
    [51.25, 1.5, 49.75],
    [51.25, 2.55, 48.7],
    [51.25, 4.09, 47.16],
  ])(
    'invoices gross %s with prepaid reduction %s at %s',
    (gross, reduction, expected) => {
      const copied = (service as any).getDiscountsToApply(
        {
          discounts: [
            { type: 7, value: reduction, valueType: 0 },
            { type: 2, value: 8, valueType: 1 },
          ],
        },
        100,
      );
      expect(copied.map((d) => d.type)).toEqual([7]);
      expect((service as any).computeDiscountedNetTotal(gross, copied)).toBe(
        expected,
      );
    },
  );

  it('applies prepaid after other discounts without applying payment frequency twice', () => {
    expect(
      (service as any).computeDiscountedNetTotal(36.25, [
        { type: 3, value: 2.5, valueType: 0 },
        { type: 7, value: 2.9, valueType: 0 },
        { type: 2, value: 8, valueType: 1 },
      ]),
    ).toBe(30.85);
  });

  it('caps a prepaid reduction at the remaining nonnegative price', () => {
    expect(
      (service as any).computeDiscountedNetTotal(2, [
        { type: 7, value: 2.9, valueType: 0 },
      ]),
    ).toBe(0);
  });

  it('keeps cascading discounts aligned with stored private lesson totals', () => {
    const netTotal = (service as any).computeDiscountedNetTotal(32.5, [
      {
        type: InvoiceLineItemDiscount.TYPE_MULTIPLE_ENROLMENT,
        value: 1.25,
        valueType: InvoiceLineItemDiscount.VALUE_TYPE_DOLLAR,
      },
      {
        type: InvoiceLineItemDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
        value: 3,
        valueType: InvoiceLineItemDiscount.VALUE_TYPE_PERCENTAGE,
      },
    ]);

    expect(netTotal).toBe(30.31);
  });

  it('uses the stored exploded total for invoice and credit amounts', async () => {
    const manager = {} as any;
    const repo = {
      getNextInvoiceNumber: vi.fn().mockResolvedValue(72401),
      createInvoice: vi.fn().mockResolvedValue({
        id: 901,
        userId: 14863,
        invoiceNumber: 72401,
      }),
      findLessonItem: vi.fn().mockResolvedValue({ id: 1, taxStatusId: 1 }),
      getTaxDataForItem: vi.fn().mockResolvedValue({
        taxTypeName: 'No Tax',
        taxCodeRate: 0,
        taxCodeCode: 'ON',
        taxStatusName: 'No Tax',
      }),
      createInvoiceLineItem: vi.fn().mockResolvedValue({ id: 3001 }),
      createInvoiceItemLesson: vi.fn().mockResolvedValue(undefined),
      createLineItemDiscounts: vi.fn().mockResolvedValue(undefined),
      updateLineItemTotals: vi.fn().mockResolvedValue(undefined),
      updateInvoiceTotals: vi.fn().mockResolvedValue(undefined),
      saveCreditTransfer: vi.fn().mockResolvedValue(undefined),
    };
    const lessonRepo = {
      getLessonNetCreditAmount: vi.fn().mockResolvedValue(15.15),
    };
    const invoiceService = new PrivateLessonInvoiceService(
      {} as any,
      repo as any,
      lessonRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const lesson = Object.assign(new Lesson(), {
      id: 5272881,
      isExploded: 1,
      programRate: 65,
      teacherRate: 30,
      tax: 0,
      duration: '00:15:00',
      status: LessonStatusEnum.SCHEDULED,
      date: new Date('2026-09-03T19:30:00.000Z'),
      privateLesson: [{ total: 15.15 }],
      discounts: [
        {
          type: InvoiceLineItemDiscount.TYPE_MULTIPLE_ENROLMENT,
          value: 0.62,
          valueType: InvoiceLineItemDiscount.VALUE_TYPE_DOLLAR,
        },
        {
          type: InvoiceLineItemDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
          value: 3,
          valueType: InvoiceLineItemDiscount.VALUE_TYPE_PERCENTAGE,
        },
      ],
      course: {
        locationId: 15,
        program: { name: 'Bass Guitar' },
        enrolments: [
          {
            id: 34301,
            student: {
              firstName: 'Test',
              lastName: 'Discount',
              user: {
                id: 14863,
                userLocation: { locationId: 15 },
              },
            },
          },
        ],
      },
      teacher: {
        profile: { firstname: 'Test', lastname: 'teacher' },
      },
    });

    await (invoiceService as any).createPrivateLessonInvoice(
      lesson,
      manager,
      694,
    );

    expect(repo.updateLineItemTotals).toHaveBeenCalledWith(
      3001,
      15.15,
      0,
      manager,
    );
    expect(repo.updateInvoiceTotals).toHaveBeenCalledWith(
      901,
      15.15,
      0,
      15.15,
      15.15,
      manager,
    );
    expect(repo.saveCreditTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 15.15 }),
      manager,
      694,
    );
  });

  it('keeps calculated totals for normal private lessons', () => {
    const amounts = (service as any).resolveInvoiceAmounts(
      {
        isExploded: 0,
        tax: 0,
        privateLesson: [{ total: 15.15 }],
      },
      15.16,
      0,
    );

    expect(amounts).toEqual({ netTotal: 15.16, tax: 0, total: 15.16 });
  });

  it('preserves the stored tax and total for an exploded private lesson', () => {
    const amounts = (service as any).resolveInvoiceAmounts(
      {
        isExploded: 1,
        tax: 1.97,
        privateLesson: [{ total: 17.12 }],
      },
      15.16,
      2.03,
    );

    expect(amounts).toEqual({ netTotal: 15.15, tax: 1.97, total: 17.12 });
  });

  it('falls back to calculated amounts when an exploded total is unavailable', () => {
    const amounts = (service as any).resolveInvoiceAmounts(
      {
        isExploded: 1,
        tax: 0,
        privateLesson: [],
      },
      15.16,
      0,
    );

    expect(amounts).toEqual({ netTotal: 15.16, tax: 0, total: 15.16 });
  });
});
