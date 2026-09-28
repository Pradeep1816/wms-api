import { IsArray, ArrayNotEmpty, IsInt, IsString, Matches } from 'class-validator';

export class EditDurationRequestDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'At least one lessonId is required' })
  @IsInt({ each: true })
  lessonIds: number[];

  /** Duration as time (e.g. HH:MM or HH:MM:SS). */
  @IsString()
  @Matches(/^\d{1,2}:\d{2}(:\d{2})?$/, {
    message: 'duration must be time format (e.g. 1:30 or 1:30:00)',
  })
  duration: string;
}
