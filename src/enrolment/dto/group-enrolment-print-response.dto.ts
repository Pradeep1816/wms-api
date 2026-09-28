import { Expose, Type } from 'class-transformer';

export class ScheduleLessonDto {
  @Expose()
  date: string;
}

export class GroupEnrolmentPrintDetailDto {
  @Expose()
  enrolmentId: number;

  @Expose()
  studentName: string;

  @Expose()
  programName: string;

  @Expose()
  teacherName: string;

  @Expose()
  time: string;

  @Expose()
  duration: string;

  @Expose()
  startDate: string;

  @Expose()
  endDate: string;

  @Expose()
  @Type(() => ScheduleLessonDto)
  schedule: ScheduleLessonDto[];
}

export class GroupEnrolmentPrintDataDto {
  @Expose()
  body: GroupEnrolmentPrintDetailDto;
}

export class GroupEnrolmentPrintResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Group enrolment print details retrieved successfully';

  @Expose()
  data: GroupEnrolmentPrintDataDto;
}
