
import { Expose } from 'class-transformer';

export class DeleteCityResponseDto {
  @Expose()
  id: number;

  @Expose()
  name:string;

  @Expose()
  provinceId:number

  @Expose()
  deletedOn: string;

  @Expose()
  deletedByUserId: number;
}
