import { Expose, Transform } from 'class-transformer';
import { formatCurrency } from '../../utils/formatters';

export class ReceicePaymentCreditRoyaltyPurposeDto {
  @Expose()
  itemCategoryId: number;

  @Expose()
  categoryName: string;

  @Expose()
  rateApplied: number;

  @Expose()
  amount: number;
}

export class ReceicePaymentsCreditDataDto {

  @Expose()
  id:number;

  @Expose()
  type: string;

  @Expose()
  reference: string;

  @Expose()
  @Transform(({ value }) => formatCurrency(value))
  amount: number;

  @Expose()
  @Transform(({ value }) => formatCurrency(value))
  payment: number;

  @Expose()
  royaltyPurposes: ReceicePaymentCreditRoyaltyPurposeDto[];
}

export class ReceicePaymentsCreditsResponseDto {
  @Expose()
  body: ReceicePaymentsCreditDataDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
