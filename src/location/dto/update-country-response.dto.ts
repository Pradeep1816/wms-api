import { Expose, Type } from 'class-transformer';

export class UpdateCountryResponseDto {
  @Expose()
  @Type(() => Number)
  id: number;

  @Expose()
  @Type(() => String)
  name: string;

  @Expose()
  @Type(() => String)
  updatedOn: string;

  @Expose()
  @Type(() => Number)
  updatedByUserId: number;
}
