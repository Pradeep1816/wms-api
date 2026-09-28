import { Expose } from 'class-transformer';

export class LessonDetailsDto {
  @Expose()
  student: string;

  @Expose()
  customer: string;

  @Expose()
  teacher: string;

  @Expose()
  originalDate?: string;

  @Expose()
  scheduledDate: string;

  @Expose()
  time: string | null;

  @Expose()
  duration: string;

  @Expose()
  status: string | null;

  @Expose()
  expiryDate: string;

  @Expose()
  rescheduleStatement?: string | null;
}

export class EmailTemplateDto {
  @Expose()
  id: number;

  @Expose()
  to: string;

  @Expose()
  subject: string;

  @Expose()
  header: string;

  @Expose()
  footer: string;
}

export class LessonEmailStatementBodyDto {
  @Expose()
  lesson: LessonDetailsDto;
}

export class LessonEmailStatementDataDto {
  @Expose()
  body: LessonEmailStatementBodyDto;

  @Expose()
  emailTemplate: EmailTemplateDto;
}

export class LessonEmailStatementResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Lesson email statement retrieved successfully';

  @Expose()
  data: LessonEmailStatementDataDto;
}
