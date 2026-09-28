import { Expose, Type } from 'class-transformer';

export class LessonEventDto {
  @Expose()
  lessonId: number;

  @Expose()
  isOwing?: boolean | null;

  @Expose()
  isOwingRentalAgreement?: boolean | null;

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
  tooltip: Array<{name: string, value: string}>;

  @Expose()
  isOnline: boolean;

  @Expose()
  programId: number | null;

  @Expose()
  enrolmentId: number | null;
}

export class AvailabilityEventDto {
  @Expose()
  resourceId: number;

  @Expose()
  title: string;

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

export class RenderDayEventsResponseDto {
  @Expose()
  @Type(() => LessonEventDto)
  lessons: LessonEventDto[];

  @Expose()
  @Type(() => AvailabilityEventDto)
  availability: AvailabilityEventDto[];

  @Expose()
  totalEvents: number;

  @Expose()
  date: string;

  @Expose()
  locationId: number;
}
