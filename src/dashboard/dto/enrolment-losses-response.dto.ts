import { Expose, Type } from 'class-transformer';

export class EnrolmentLossValueDto {
  @Expose()
  name: string;

  @Expose()
  count: number;
}

export class EnrolmentLossesResponseDto {
  @Expose()
  @Type(() => EnrolmentLossValueDto)
  values: EnrolmentLossValueDto[];

  @Expose()
  total: number;
}
