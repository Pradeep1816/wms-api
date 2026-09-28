import { ItemTypeEnum } from '../../enums/item-type.enum';
import { InvoiceLineItemDiscount } from '../../entities/invoice-line-item-discount.entity';
import { InvoiceItemsTransformationService } from './invoice-items-transformation.service';

describe('InvoiceItemsTransformationService', () => {
  it('displays persisted net total and effective discount for a cent-safe lesson line', () => {
    const service = new InvoiceItemsTransformationService();
    const lineItem = {
      id: 3001,
      itemTypeId: ItemTypeEnum.TYPE_PRIVATE_LESSON,
      amount: 65,
      unit: 0.25,
      netTotal: 15.15,
      cost: 0,
      taxRate: 0,
      description: 'Exploded lesson',
      code: 'PRIVATE LESSON',
      royaltyFree: 0,
      taxStatus: 'No Tax',
    } as any;
    const discounts = [
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
    ] as InvoiceLineItemDiscount[];

    const result = service.transformToResponse(
      [lineItem],
      new Map([[lineItem.id, discounts]]),
      false,
      true,
    );

    expect(result.body.lineItems[0]).toMatchObject({
      discount: '$1.10',
      price: '$15.15',
    });
  });

  it('falls back to discount calculation when persisted net total is unavailable', () => {
    const service = new InvoiceItemsTransformationService();
    const lineItem = {
      id: 3002,
      itemTypeId: ItemTypeEnum.TYPE_PRIVATE_LESSON,
      amount: 65,
      unit: 0.25,
      cost: 0,
      taxRate: 0,
      description: 'Normal lesson',
      code: 'PRIVATE LESSON',
      royaltyFree: 0,
      taxStatus: 'No Tax',
    } as any;
    const discounts = [
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
    ] as InvoiceLineItemDiscount[];

    const result = service.transformToResponse(
      [lineItem],
      new Map([[lineItem.id, discounts]]),
      false,
      true,
    );

    expect(result.body.lineItems[0]).toMatchObject({
      discount: '$1.09',
      price: '$15.16',
    });
  });

  it('keeps the existing calculation path for group lessons', () => {
    const service = new InvoiceItemsTransformationService();
    const lineItem = {
      id: 3003,
      itemTypeId: ItemTypeEnum.TYPE_GROUP_LESSON,
      amount: 30,
      unit: 1,
      netTotal: 29,
      cost: 0,
      taxRate: 0,
      description: 'Group lesson',
      code: 'GROUP LESSON',
      royaltyFree: 0,
      taxStatus: 'No Tax',
    } as any;

    const result = service.transformToResponse(
      [lineItem],
      new Map(),
      false,
      true,
    );

    expect(result.body.lineItems[0]).toMatchObject({
      discount: '$0.00',
      price: '$30.00',
    });
  });
});
