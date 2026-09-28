import { IsNotEmpty, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class TeacherByProgramRequestDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  programId: number;
}

