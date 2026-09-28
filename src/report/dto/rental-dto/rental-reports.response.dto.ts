import { Expose, Type } from 'class-transformer';
import { RentalReportItemDto } from './rental-report-item.dto';

export class RentalReportsResponseDto {
  @Expose()
  @Type(() => RentalReportItemDto)
  body: RentalReportItemDto[];

  @Expose()
  total: number;
}