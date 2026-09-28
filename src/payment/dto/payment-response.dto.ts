import { Expose, Type, Transform } from 'class-transformer';
import { formatCurrency } from '../../utils/formatters';

export class CustomerPaymentResponseDto {
  @Expose()
  id: number;

  @Expose()
  date: string;

  @Expose()
  notes: string;

  @Expose()
  @Transform(({ value }) => formatCurrency(value))
  amount: number;

  @Expose()
  @Transform(({ value }) => formatCurrency(value))
  used: number;

  @Expose()
  @Transform(({ value }) => formatCurrency(value))
  remaining: number;
}

export class CustomerPaymentsDataDto {
  @Expose()
  body: CustomerPaymentResponseDto[];

  @Expose()
  footer: { totalRemaining: string }[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class CustomerPaymentsListResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Customer payments retrieved successfully';

  @Expose()
  data: CustomerPaymentsDataDto;
}


