import { Expose, Type } from 'class-transformer';

export class CityResponseDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  province: string;
}

export class CitiesListResponseDto {
  @Expose()
  @Type(() => CityResponseDto)
  body: CityResponseDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class CitiesApiResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Cities retrieved successfully';

  @Expose()
  @Type(() => CitiesListResponseDto)
  data: CitiesListResponseDto;
}
