import { Expose } from 'class-transformer';

export class EnrolmentProgramOptionDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  rate: number | null;
}

export class EnrolmentPaymentFrequencyOptionDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  frequencyLength: number;
}

export class CustomerDiscountDto {
  @Expose()
  value: number;
}

export class CustomerEnrolmentMetadataDto {
  @Expose()
  programs: EnrolmentProgramOptionDto[];

  @Expose()
  paymentFrequencies: EnrolmentPaymentFrequencyOptionDto[];

  @Expose()
  discount: CustomerDiscountDto | null;
}


