import { Expose } from 'class-transformer';

export class EnrolmentPaymentFrequencyDto {
  @Expose()
  id: number;

  @Expose()
  paymentFrequencyId?: number;

  @Expose()
  paymentFrequency: string;

  @Expose()
  effectiveDate?: string; // Format: "MMM dd, yyyy" (e.g., "Mar 01, 2025")
}

export class EnrolmentPaymentFrequencyDataDto {
  @Expose()
  body: EnrolmentPaymentFrequencyDto;
}

export class EnrolmentPaymentFrequencyResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Payment Frequency retrieved successfully';

  @Expose()
  data: EnrolmentPaymentFrequencyDataDto;
}
