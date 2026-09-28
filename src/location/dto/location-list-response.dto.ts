import { Expose, Type } from 'class-transformer';

export class LocationListResponseDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  address: string;

  @Expose()
  email: string;
}

export class LocationItemResponseDto {
  @Expose()
  @Type(() => LocationListResponseDto)
  body: LocationListResponseDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class LocationApiResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Locations retrieved successfully';

  @Expose()
  @Type(() => LocationListResponseDto)
  data: LocationListResponseDto;
}
