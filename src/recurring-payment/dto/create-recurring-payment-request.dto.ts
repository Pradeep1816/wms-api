import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateCustomerRecurringPaymentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId: number;

  @IsString()
  @IsNotEmpty()
  startDate: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  paymentDay: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  paymentMethodId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  paymentFrequencyId: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  amount: number;

  @Transform(({ value }) => {
    const normalizedValue =
      typeof value === 'string' ? value.trim() : (value as unknown);

    if (normalizedValue === '1' || normalizedValue === 1) {
      return 1;
    }
    if (normalizedValue === '0' || normalizedValue === 0) {
      return 0;
    }
    return Number.NaN;
  })
  @IsIn([0, 1])
  isEnabled: number;

  @IsOptional()
  @IsString()
  expiryMonth?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  expiryYear?: number | null;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    return Array.isArray(value) ? value.map(Number) : [Number(value)];
  })
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  enrolmentIds?: number[];
}
