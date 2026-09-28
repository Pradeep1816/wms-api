import { Expose } from 'class-transformer';

export class CityGeodataDto {
  @Expose()
  id: number;

  @Expose()
  name: string;
}

export class ProvinceGeodataDto {
  @Expose()
  id: number;

  @Expose()
  name: string;
}

export class CountryGeodataDto {
  @Expose()
  id: number;

  @Expose()
  name: string;
}

export class LocationGeodataResponseDto {
  @Expose()
  city?: CityGeodataDto[];

  @Expose()
  province?: ProvinceGeodataDto[];

  @Expose()
  country?: CountryGeodataDto[];
}
