import { Expose, Type } from 'class-transformer';

export class DeleteCountryResponseDto {
  @Expose()
  @Type(() => Number)
  id: number;

  @Expose()
  @Type(() => String)
  name: string;

  @Expose()
  @Type(() => String)
  deletedOn: string;   

  @Expose()
  @Type(() => Number)
  deletedByUserId: number;
}
