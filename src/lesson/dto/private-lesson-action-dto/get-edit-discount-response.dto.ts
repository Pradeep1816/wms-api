import { Expose } from 'class-transformer';

/**
 * Response DTO for GET edit-discount (current discount values for selected lessons).
 * When all lessons share the same value, that value is returned; when they differ or none, 0 is returned and *Mixed indicates mixed/no row.
 */
export class GetEditDiscountResponseDto {
  @Expose()
  lessonIds: number[];

  @Expose()
  customerDiscount: number;

  @Expose()
  customerMixed: boolean;

  @Expose()
  paymentFrequencyDiscount: number;

  @Expose()
  paymentFrequencyMixed: boolean;

  @Expose()
  multiEnrolmentDiscount: number;

  @Expose()
  multiEnrolmentMixed: boolean;

  @Expose()
  lineItemDiscount: number;

  @Expose()
  lineItemDiscountValueType: number;

  @Expose()
  lineItemMixed: boolean;
}

export class GetEditDiscountResponse {
  
  @Expose()
  body: GetEditDiscountResponseDto;
}