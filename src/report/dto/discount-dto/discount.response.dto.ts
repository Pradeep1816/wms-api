import { Expose, Type } from 'class-transformer';
import { DiscountReportRowDto } from './discount-report-row.dto';

export class DiscountTotalsDto {
  @Expose()
  totalDiscount: string;
}


export class DiscountReportResponseDto {
  @Expose()
  @Type(() => DiscountReportRowDto)
  body: DiscountReportRowDto[];

  @Expose()
  @Type(() => DiscountTotalsDto)
  footer: DiscountTotalsDto;
}
