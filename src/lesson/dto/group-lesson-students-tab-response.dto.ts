import { Expose, Type } from 'class-transformer';

export class GroupLessonStudentTabItemDto {
  @Expose()
  groupLessonId: number;

  @Expose()
  lessonId: number;

  @Expose()
  enrolmentId: number;

  @Expose()
  studentId: number;

  @Expose()
  studentName: string;

  @Expose()
  customerName: string;

  @Expose()
  dueDate: string | null;

  @Expose()
  grossPrice: string;

  @Expose()
  discount: string;

  @Expose()
  netPrice: string;

  @Expose()
  owing: string;

  @Expose()
  hasInvoice: boolean;

  @Expose()
  invoiceId: number | null;

  @Expose()
  hasPayment: boolean;
}

export class GroupLessonStudentsTabDataDto {
  @Expose()
  @Type(() => GroupLessonStudentTabItemDto)
  body: GroupLessonStudentTabItemDto[];
}
