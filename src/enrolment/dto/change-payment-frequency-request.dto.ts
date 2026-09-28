import { Expose, Type } from 'class-transformer';
import { IsDefined, IsInt, IsNotEmpty, IsString, Matches, Min } from 'class-validator';

export class ChangePaymentFrequencyRequestDto {
  @Expose()
  @Type(() => Number)
  @IsDefined({ message: 'paymentFrequencyId is required' })
  @IsInt()
  @Min(1)
  paymentFrequencyId: number;

  @Expose()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z][a-z]{2} \d{1,2},\s*\d{4}$/, {
    message:
      'effectiveDate must be in format "MMM d, yyyy", "MMM dd, yyyy"',
  })
  effectiveDate: string;
}
