import { Expose } from 'class-transformer';

export class EnrolmentGainValueDto {
  @Expose()
  name: string;

  @Expose()
  count: number;
}

export class EnrolmentGainsDataDto {
  @Expose()
  values: EnrolmentGainValueDto[];

  @Expose()
  total: number;
}
