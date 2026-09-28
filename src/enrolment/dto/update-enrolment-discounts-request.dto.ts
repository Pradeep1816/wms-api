import { IsOptional, IsString } from 'class-validator';

export class UpdateEnrolmentDiscountsRequestDto {
  @IsOptional()
  @IsString()
  pfDiscount?: string; // Payment Frequency Discount (percentage) - for private enrolments only

  @IsOptional()
  @IsString()
  multipleEnrolDiscount?: string; // Multiple Enrolment Discount (dollar amount) - for private enrolments only
}
