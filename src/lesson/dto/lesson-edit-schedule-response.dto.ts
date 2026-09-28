import { Expose, Type } from 'class-transformer';

export class LessonDto {
  @Expose()
  id: number;

  @Expose()
  teacherId: number;

  @Expose()
  programId: number | null;

  @Expose()
  date: string | null;

  @Expose()
  duration: string;

  @Expose()
  classroomId: number | null;

  @Expose()
  statusCode: number;

  @Expose()
  status: string;

  @Expose()
  isOnline: boolean;

  @Expose()
  isPresent: boolean;

  @Expose()
  className: string;

  @Expose()
  backgroundColor: string | null;
}

export class PrivateLessonDto {
  @Expose()
  id: string;

  @Expose()
  expiryDate: string | null;

  @Expose()
  total: number;

  @Expose()
  balance: number;
}

export class LessonEditScheduleDataDto {
  @Expose()
  @Type(() => LessonDto)
  lesson: LessonDto;

  @Expose()
  @Type(() => PrivateLessonDto)
  privateLesson: PrivateLessonDto | null;
}

export class LessonEditScheduleResponseDto {
  @Expose()
  @Type(() => LessonEditScheduleDataDto)
  body: LessonEditScheduleDataDto;
}

