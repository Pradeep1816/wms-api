import { Expose } from 'class-transformer';

export class LocationResponseDto {
  @Expose()
  id: number;

  @Expose()
  slug: string;

  @Expose()
  name: string;
}
