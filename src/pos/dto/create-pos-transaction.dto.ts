import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreatePosTransactionDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerInfo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  customerId?: number;
}
