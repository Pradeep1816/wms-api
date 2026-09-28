import { IsOptional, IsNumber, IsString } from 'class-validator';

export class UpdateGroupEnrolmentDiscountRequestDto {
  @IsOptional()
  @IsString()
  discount?: string; // Group enrolment discount value

  @IsOptional()
  @IsNumber()
  discountType?: number; // Group enrolment discount type: 0 = percentage, 1 = dollar
}
