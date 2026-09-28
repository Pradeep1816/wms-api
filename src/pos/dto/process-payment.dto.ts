import {
  IsNotEmpty,
  IsNumber,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';

export class ProcessPaymentDto {
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  transactionId: number;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  paymentMethodId: number;

  // Compatibility for clients deployed before atomic POS checkout.
  @IsOptional()
  @IsInt()
  @Min(1)
  paymentId?: number;

  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
