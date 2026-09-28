import { Expose, Type } from 'class-transformer';

export class LessonEventDto {
  @Expose()
  lessonId: number;

  @Expose()
  isOwing: boolean | null;

  @Expose()
  isOwingRentalAgreement: boolean | null;

  @Expose()
  resourceId: number;

  @Expose()
  title: string;

  @Expose()
  start: string;

  @Expose()
  end: string;

  @Expose()
  url: string;

  @Expose()
  className: string;

  @Expose()
  backgroundColor: string;

  @Expose()
  isOnline: boolean;

  @Expose()
  programId: number | null;
}

export class AvailabilityEventDto {
  @Expose()
  resourceId: number;

  @Expose()
  start: string;

  @Expose()
  end: string;

  @Expose()
  rendering: string;

  @Expose()
  className: string;

  @Expose()
  backgroundColor: string;
}

export class TimeRangeDto {
  @Expose()
  from: string;

  @Expose()
  to: string;
}

export class DateRangeDto {
  @Expose()
  from: string;

  @Expose()
  to: string;
}

export class TeacherScheduleDataDto {
  @Expose()
  @Type(() => LessonEventDto)
  lessons: LessonEventDto[];

  @Expose()
  @Type(() => AvailabilityEventDto)
  availability: AvailabilityEventDto[];

  @Expose()
  @Type(() => TimeRangeDto)
  time: TimeRangeDto;

  @Expose()
  @Type(() => DateRangeDto)
  date: DateRangeDto;

  @Expose()
  totalEvents: number;
  @Expose()
  
  teacherId: number;
}

export class TeacherScheduleResponseDto {
  @Expose()
  @Type(() => TeacherScheduleDataDto)
  body: TeacherScheduleDataDto;
}

