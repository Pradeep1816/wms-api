import { Expose, Type } from 'class-transformer';

export class InstructionHoursValueDto {
  @Expose()
  name: string;

  @Expose()
  count: number;
}

export class InstructionHoursResponseDto {
  @Expose()
  @Type(() => InstructionHoursValueDto)
  values: InstructionHoursValueDto[];

  @Expose()
  total: number;
}
