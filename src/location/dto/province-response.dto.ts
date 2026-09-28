import { Expose, Type } from 'class-transformer';

export class ProvinceResponseDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  country: string;

  @Expose()
  taxRate: number;
}
;

export class ProvincesListResponseDto {
  @Expose()
  @Type(() => ProvinceResponseDto)
  body: ProvinceResponseDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}


export class ProvincesApiResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Provinces retrieved successfully';

  @Expose()
  @Type(() => ProvincesListResponseDto)
  data: ProvincesListResponseDto;
}

