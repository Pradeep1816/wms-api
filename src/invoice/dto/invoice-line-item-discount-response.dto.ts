import { Expose } from 'class-transformer';

export class GetInvoiceLineItemDiscountResponseDto {
  @Expose()
  lineItemIds: number[];

  @Expose()
  lineItemDiscount: number | null;

  @Expose()
  lineItemDiscountValueType: number;

  @Expose()
  customerDiscount: number | null;

  @Expose()
  paymentFrequencyDiscount: number | null;

  @Expose()
  multiEnrolmentDiscount: number | null;

  @Expose()
  isLessonItem: boolean;
}
