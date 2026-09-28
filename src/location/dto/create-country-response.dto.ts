import { Expose, Type } from 'class-transformer';

export class CreateCountryResponseDto {
  @Expose()  
  @Type(() => Number)
  id: number;

  @Expose()
  @Type(() => String)
  name: string;

  @Expose()
  @Type(() => Date)
  createdOn: string;
  
  @Expose()
  @Type(() => Number)
  createdByUserId: number;
}
