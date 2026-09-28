import { Expose, Transform } from 'class-transformer';
import { formatCurrency } from '../../utils/formatters';

export class CustomerRecurringPaymentDto {
  @Expose()
  id: number;

  @Expose()
  nextEntryDate: string;

  @Expose()
  nextPaymentDate: string;

  @Expose()
  frequency: string;

  @Expose()
  expiryDate: string;

  @Expose()
  methodName: string;

    @Expose()
    @Transform(({ value }) => formatCurrency(value))
    amount: number;

  @Expose()
  hasEnrolmentWarning: boolean;
}

export class CustomerRecurringPaymentsDataDto {
  @Expose()
  body: CustomerRecurringPaymentDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class CustomerRecurringPaymentsResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Customer recurring payments retrieved successfully';

  @Expose()
  data: CustomerRecurringPaymentsDataDto;
}
