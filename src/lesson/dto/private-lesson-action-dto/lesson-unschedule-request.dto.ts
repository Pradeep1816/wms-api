import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsNumber,
  IsObject,
  IsString,
  MinLength,
} from 'class-validator';

export class LessonUnscheduleDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Choose any lessons to unschedule' })
  @IsNumber({}, { each: true })
  @Type(() => Number)
  lessonIds: number[];

  @IsString()
  @MinLength(1, { message: 'Reason is required' })
  reason: string;
}

export class GetReasonsToUnscheduleResponseDto {
  @IsArray()
  @IsObject({ each: true })
  reasons: { id: number; reason: string }[];
  title: string;
}
