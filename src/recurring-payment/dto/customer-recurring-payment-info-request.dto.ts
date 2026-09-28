import { IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CustomerRecurringPaymentInfoRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  id?: number; // Recurring payment id
}

