export class ItemDetailsDto {
  id: number;
  code: string;
  upcCode?: string | null;
  description: string;
  price: number;
}

export class PosTransactionLineItemResponseDto {
  id: number;
  posTransactionId: number;
  itemId: number;
  quantity: number;
  price: number; // Price at time of sale
  discount: number;
  overridePrice?: number;
  lineItemTotal: number; // Calculated: (quantity × price/overridePrice) - discount
  createdAt: Date;

  // Optional: Include item details (item code, UPC, description, original price)
  item?: ItemDetailsDto;
}
