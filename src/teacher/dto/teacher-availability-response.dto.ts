import { Expose, Type } from 'class-transformer';
import {
  LessonEventDto,
  AvailabilityEventDto,
  TimeRangeDto,
  DateRangeDto,
  TeacherScheduleDataDto,
} from './teacher-schedule-response.dto';

// Reuse the same DTO structure as schedule-events for consistency
export class TeacherAvailabilityResponseDto {
  @Expose()
  @Type(() => TeacherScheduleDataDto)
  body: TeacherScheduleDataDto;
}

