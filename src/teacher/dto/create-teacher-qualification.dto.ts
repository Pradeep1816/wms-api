import { IsArray, IsNotEmpty, IsNumber, IsOptional, Min, ArrayMinSize } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateTeacherQualificationDto {
  @IsNotEmpty({ message: 'Programs array is required' })
  @IsArray({ message: 'Programs must be an array' })
  @ArrayMinSize(1, { message: 'At least one program must be provided' })
  @IsNumber({}, { each: true, message: 'Each program ID must be a number' })
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value.map(v => (typeof v === 'string' ? parseInt(v, 10) : v));
    }
    return value;
  })
  programs: number[];

  @IsOptional()
  @IsNumber({}, { message: 'Rate must be a number' })
  @Min(0, { message: 'Rate must be greater than or equal to 0' })
  @Type(() => Number)
  rate?: number;
}

