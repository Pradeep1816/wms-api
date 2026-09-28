import { ItemTypeEnum } from '../../enums/item-type.enum';
import { InvoiceLineItemDiscount } from '../../entities/invoice-line-item-discount.entity';
import { InvoiceDiscountCalculator } from './invoice-discount.calculator';

describe('InvoiceDiscountCalculator', () => {
  it('reports the effective discount from persisted invoice net total', () => {
    const calculator = new InvoiceDiscountCalculator();
    const lineItem = {
      itemTypeId: ItemTypeEnum.TYPE_PRIVATE_LESSON,
      amount: 65,
      unit: 0.25,
      netTotal: 15.15,
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
    } as any;

    expect(calculator.calculateTotalDiscounts([lineItem], {} as any)).toBe(
      1.1,
    );
    expect(calculator.calculateLineItemDiscount(lineItem, {} as any)).toBe(
      1.0889,
    );
  });

  it('falls back to discount rows when persisted net total is unavailable', () => {
    const calculator = new InvoiceDiscountCalculator();
    const lineItem = {
      itemTypeId: ItemTypeEnum.TYPE_PRIVATE_LESSON,
      amount: 65,
      unit: 0.25,
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
    } as any;

    expect(calculator.calculateTotalDiscounts([lineItem], {} as any)).toBe(
      1.09,
    );
  });

  it('keeps the existing discount calculation for group lessons', () => {
    const calculator = new InvoiceDiscountCalculator();
    const lineItem = {
      itemTypeId: ItemTypeEnum.TYPE_GROUP_LESSON,
      amount: 30,
      unit: 1,
      netTotal: 29,
      discounts: [],
    } as any;

    expect(calculator.calculateTotalDiscounts([lineItem], {} as any)).toBe(0);
  });
});
