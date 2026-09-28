import { Expose, Type } from 'class-transformer';

export class TaxCodeResponseDto {
  @Expose()
  id: number;

  @Expose()
  taxName: string;

  @Expose()
  provinceName: string;

  @Expose()
  rate: number;

  @Expose()
  startDate: string;

  @Expose()
  code: string;
}


export class TaxCodeListResponseDto {
  @Expose()
  @Type(() => TaxCodeResponseDto)
  body: TaxCodeResponseDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class TaxCodeApiResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Tax codes retrieved successfully';

  @Expose()
  @Type(() => TaxCodeListResponseDto)
  data: TaxCodeListResponseDto;
}
