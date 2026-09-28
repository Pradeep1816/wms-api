import { Expose, Type } from 'class-transformer';

/**
 * Default response (enable=false): description, qty, price
 */
export class InvoiceLineItemBasicInfo {
  @Expose() isPos: boolean;
  @Expose() returnedQuantity: number;
  @Expose() canReturn: boolean;
  @Expose()
  id: number;

  @Expose()
  code: string;

  @Expose()
  description: string;

  @Expose()
  qty: number; 

  @Expose()
  price: string; 

  @Expose()
  cost: string; 
}

/**
 * Full response (enable=true): all fields
 */
export class InvoiceLineItemInfo {
  @Expose() isPos: boolean;
  @Expose() returnedQuantity: number;
  @Expose() canReturn: boolean;
  @Expose()
  id: number;

  @Expose()
  code: string;

  @Expose()
  royaltyFree: string; 

  @Expose()
  description: string;

  @Expose()
  qty: number;

  @Expose()
  discount: string;

  @Expose()
  taxStatus: string; 

  @Expose()
  tax: string; 

  @Expose()
  unitPrice: string; 

  @Expose()
  cost: string; 

  @Expose()
  price: string; 
}

export class InvoiceItemsBody {
  @Expose()
  @Type(() => InvoiceLineItemInfo)
  lineItems: (InvoiceLineItemInfo | InvoiceLineItemBasicInfo)[];
}

export class InvoiceItemsResponse {
  @Expose()
  @Type(() => InvoiceItemsBody)
  body: InvoiceItemsBody;
}
