import { Expose, Type } from 'class-transformer';

export class CountryResponseDto {
  @Expose()
  id: number;

  @Expose()
  name: string;
}

export class CountriesListResponseDto {
  @Expose()
  @Type(() => CountryResponseDto)
  body: CountryResponseDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class CountriesApiResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Countries retrieved successfully';

  @Expose()
  @Type(() => CountriesListResponseDto)
  data: CountriesListResponseDto;
}
