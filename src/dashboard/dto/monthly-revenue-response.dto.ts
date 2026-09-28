import { Expose, Type } from 'class-transformer';

export class MonthlyRevenueValueDto {
  @Expose()
  x: string; // Month name (e.g., "Jan", "Feb", "Mar")

  @Expose()
  y: number; // Backward-compatible alias for revenueUsed

  @Expose()
  revenueUsed: number;

  @Expose()
  revenueCollected: number;
}

export class MonthlyRevenueResponseDto {
  @Expose()
  @Type(() => MonthlyRevenueValueDto)
  values: MonthlyRevenueValueDto[];
}
