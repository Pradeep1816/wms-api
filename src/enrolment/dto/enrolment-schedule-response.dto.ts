import { Expose } from 'class-transformer';

export class EnrolmentScheduleDto {
  @Expose()
  id: number;

  @Expose()
  day: string;

  @Expose()
  time: string;

  @Expose()
  startDate: string;

  @Expose()
  endDate: string;
}

export class EnrolmentScheduleDataDto {
  @Expose()
  body: EnrolmentScheduleDto;
}

export class EnrolmentScheduleResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Enrolment Schedule retrieved successfully';

  @Expose()
  data: EnrolmentScheduleDataDto;
}

