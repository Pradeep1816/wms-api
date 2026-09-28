import { Expose } from 'class-transformer';

export class AccountReceivableDataDto {
  @Expose()
  id: number;

  @Expose()
  customerName: string;

  @Expose()
  status: string;

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

  // Internal property for accurate totals calculation (not exposed in API response)
  _raw?: {
    aging_0_30: number;
    aging_31_60: number;
    aging_61_90: number;
    aging_90_plus: number;
    total: number;
    prePaidLessons: number;
    unusedCredits: number;
    balance: number;
  };
}
