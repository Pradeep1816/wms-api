import { IsOptional, IsNumber, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export const CUSTOMER_PAYMENTS_ORDER_BY = ['date', 'amount', 'id', 'balance'] as const;
export type CustomerPaymentsOrderBy = (typeof CUSTOMER_PAYMENTS_ORDER_BY)[number];

export const CUSTOMER_PAYMENTS_ORDER = ['ASC', 'DESC'] as const;
export type CustomerPaymentsOrder = (typeof CUSTOMER_PAYMENTS_ORDER)[number];

export class CustomerPaymentsRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsIn(CUSTOMER_PAYMENTS_ORDER_BY, { message: 'orderBy must be one of: date, amount, id, balance' })
  orderBy?: CustomerPaymentsOrderBy = 'date';

  @IsOptional()
  @IsIn(CUSTOMER_PAYMENTS_ORDER, { message: 'order must be ASC or DESC' })
  order?: CustomerPaymentsOrder = 'DESC';
}

