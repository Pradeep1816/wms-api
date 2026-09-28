import { IsNumber, IsNotEmpty, IsString, IsOptional, Min, Max, Matches } from 'class-validator';

export class ModifyTeacherAvailabilityDto {
  @IsNotEmpty({ message: 'Day is required' })
  @IsNumber({}, { message: 'Day must be a number' })
  @Min(1, { message: 'Day must be between 1 and 7' })
  @Max(7, { message: 'Day must be between 1 and 7' })
  day: number;

  @IsNotEmpty({ message: 'From time is required' })
  @IsString({ message: 'From time must be a string' })
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/, {
    message: 'From time must be in HH:mm:ss format (e.g., "13:00:00")',
  })
  fromTime: string;

  @IsNotEmpty({ message: 'To time is required' })
  @IsString({ message: 'To time must be a string' })
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/, {
    message: 'To time must be in HH:mm:ss format (e.g., "14:00:00")',
  })
  toTime: string;

  @IsOptional()
  @IsNumber({}, { message: 'Classroom ID must be a number' })
  classroomId?: number;
}

