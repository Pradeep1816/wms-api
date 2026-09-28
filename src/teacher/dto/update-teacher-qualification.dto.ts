import { IsNumber, IsNotEmpty, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateTeacherQualificationDto {
  @IsNotEmpty({ message: 'Rate is required' })
  @IsNumber({}, { message: 'Rate must be a number' })
  @Min(0, { message: 'Rate must be greater than or equal to 0' })
  @Type(() => Number)
  rate: number;
}

