import { Expose, Type } from 'class-transformer';
import { AccountReceivableDataDto } from './account-receivable-data.dto';

export class AccountReceivableTotalsDto {
  @Expose()
  aging_0_30: number;

  @Expose()
  aging_31_60: number;

  @Expose()
  aging_61_90: number;

  @Expose()
  aging_90_plus: number;

  @Expose()
  total: number;

  @Expose()
  prePaidLessons: number;

  @Expose()
  unusedCredits: number;

  @Expose()
  balance: number;
}

export class AccountReceivablePaginationDto {
  @Expose()
  page: number;

  @Expose()
  limit: number;

  @Expose()
  total: number;

  @Expose()
  totalPages: number;
}

export class AccountReceivableResponseDto {
  @Expose()
  @Type(() => AccountReceivableDataDto)
  body: AccountReceivableDataDto[];

  @Expose()
  @Type(() => AccountReceivableTotalsDto)
  footer: AccountReceivableTotalsDto;

  @Expose()
  @Type(() => AccountReceivablePaginationDto)
  pagination: AccountReceivablePaginationDto;
}
