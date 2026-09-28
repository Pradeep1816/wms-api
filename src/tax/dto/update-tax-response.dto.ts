import { Expose } from "class-transformer";

export class UpdateTaxCodeResponseDto {
  @Expose()
  id: number;

  @Expose()
  taxTypeId: number;

  @Expose()
  provinceId: number;

  @Expose()
  rate: number;

  @Expose()
  startDate: string;

  @Expose()
  code: string;


  @Expose()
  updatedByUserId: number;
}
