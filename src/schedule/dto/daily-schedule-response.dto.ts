import { Expose, Type } from 'class-transformer';

export class DailyScheduleItemDto {
  @Expose()
  lessonId: number;

  @Expose()
  startTime: string;

  @Expose()
  program: string;

  @Expose()
  student: string;

  @Expose()
  teacher: string;

  @Expose()
  classroom: string | null;

  @Expose()
  status: string;

  @Expose()
  colorCode: string | null;
}

export class DailyScheduleDataDto {
  @Expose()
  @Type(() => DailyScheduleItemDto)
  body: DailyScheduleItemDto[];

  @Expose()
  date: string;
}
