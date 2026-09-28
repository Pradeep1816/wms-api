import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdatePosTransactionCustomerDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  customerId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerInfo?: string;

  @IsOptional()
  @IsBoolean()
  isWalkIn?: boolean;
}
