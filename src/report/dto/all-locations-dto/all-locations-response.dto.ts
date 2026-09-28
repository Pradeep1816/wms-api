import { Expose, Type, Transform } from 'class-transformer';
import { LocationReportDataDto } from './all-locations-data.dto';


export class AllLocationsReportSummaryDto {
  @Expose()
  totalActiveEnrolments: number;

  @Expose()
  @Transform(({ value }) => value.toFixed(2))
  totalRevenue: string;

  @Expose()
  @Transform(({ value }) => value.toFixed(2))
  totalRoyalty: string;

  @Expose()
  @Transform(({ value }) => value.toFixed(2))
  totalAdvertisement: string;

  @Expose()
  @Transform(({ value }) => value.toFixed(2))
  totalTax: string;

  @Expose()
  @Transform(({ value }) => value.toFixed(2))
  grandTotal: string;
}

export class AllLocationsReportDateRangeDto {
  @Expose()
  fromDate: string;

  @Expose()
  toDate: string;
}

export class AllLocationsReportResponseDto {
  @Expose()
  @Type(() => LocationReportDataDto)
  body: LocationReportDataDto[];

  @Expose()
  @Type(() => AllLocationsReportSummaryDto)
  footer: AllLocationsReportSummaryDto;


  @Expose()
  totalLocations: number;
}
