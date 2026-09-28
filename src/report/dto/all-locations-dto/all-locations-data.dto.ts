import { Expose, Transform } from 'class-transformer';

export class LocationReportDataDto {
  @Expose()
  locationId: number;

  @Expose()
  locationName: string;

  @Expose()
  activeEnrolments: number;

  @Expose()
  @Transform(({ value }) => value.toFixed(2))
  revenue: string;

  @Expose()
  @Transform(({ value }) => value.toFixed(2))
  royalty: string;

  @Expose()
  royaltyBreakdown: Array<{
    categoryId: number;
    categoryName: string;
    rate: string;
    revenue: string;
    royalty: string;
  }>;

  @Expose()
  @Transform(({ value }) => value.toFixed(2))
  advertisement: string;

  @Expose()
  @Transform(({ value }) => value.toFixed(2))
  hst: string;

  @Expose()
  @Transform(({ value }) => value.toFixed(2))
  total: string;
}
