import { Expose } from 'class-transformer';

export class ScheduleHistoryItemDto {
  @Expose()
  id: number;

  @Expose()
  date: string;

  @Expose()
  day: string;

  @Expose()
  time: string;

  @Expose()
  duration: string;

  @Expose()
  teacher: string;
}

export class EnrolmentScheduleHistoryDataDto {
  @Expose()
  body: ScheduleHistoryItemDto[];
}

export class EnrolmentScheduleHistoryResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Schedule History retrieved successfully';

  @Expose()
  data: EnrolmentScheduleHistoryDataDto;
}

