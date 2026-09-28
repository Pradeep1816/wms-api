import { Expose, Type } from 'class-transformer';

export class EmailTemplateDto {
  @Expose()
  id: number;

  @Expose()
  subject: string;

  @Expose()
  header: string;

  @Expose()
  footer: string;
}

export class ScheduleDto {
  @Expose()
  id: number;

  @Expose()
  day: number;

  @Expose()
  dayName: string;

  @Expose()
  fromTime: string;

  @Expose()
  duration: string;
}

export class LessonDto {
  @Expose()
  id: number;

  @Expose()
  teacherName: string;

  @Expose()
  date: string;

  @Expose()
  status: string;
}

export class EnrolmentDetailsDto {
  @Expose()
  id: number;

  @Expose()
  studentId: number;

  @Expose()
  studentName: string;

  @Expose()
  customerId: number;

  @Expose()
  customerName: string;

  @Expose()
  courseId: number;

  @Expose()
  programName: string;

  @Expose()
  teacherName: string;

  @Expose()
  startDate: string;

  @Expose()
  endDate: string;
}

export class EnrolmentEmailBodyDto {
  @Expose()
  @Type(() => EnrolmentDetailsDto)
  enrolment: EnrolmentDetailsDto | null;

  @Expose()
  emails: string[];

  @Expose()
  @Type(() => EmailTemplateDto)
  emailTemplate: EmailTemplateDto | null;

  @Expose()
  @Type(() => LessonDto)
  lessons: LessonDto[];

  @Expose()
  @Type(() => ScheduleDto)
  schedules: ScheduleDto[];

  @Expose()
  totalLessons: number;

  @Expose()
  remainingLessons: number;
}

export class EnrolmentEmailDataDto {
  @Expose()
  @Type(() => EnrolmentEmailBodyDto)
  body: EnrolmentEmailBodyDto;
}

export class EnrolmentEmailResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Enrolment email data retrieved successfully';

  @Expose()
  @Type(() => EnrolmentEmailDataDto)
  data: EnrolmentEmailDataDto;
}
