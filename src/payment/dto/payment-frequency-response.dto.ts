import { Expose } from 'class-transformer';

export class PaymentFrequencyDataDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  frequencyLength: number;
}

export class PaymentFrequencyResponseDto {
  @Expose()
  body: PaymentFrequencyDataDto[];
}
