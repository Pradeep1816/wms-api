import { PosTransactionLineItemResponseDto } from './pos-transaction-line-item-response.dto'

export class PosTransactionResponseDto {
  id: number;
  transactionId: string;
  locationId: number;
  type: string;
  date: Date;
  customerInfo?: string;
  status: string;
  subtotal: number;
  discountAmount: number;
  tax: number;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  lineItems: PosTransactionLineItemResponseDto[];
  createdAt: Date;
  updatedAt: Date;
}
