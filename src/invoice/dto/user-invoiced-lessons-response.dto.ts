import { Expose } from 'class-transformer';

export class UserInvoicedLessonDto {
  @Expose()
  id: number;

  @Expose()
  invoiceDate?: string; // Optional - not needed when grouped by date

  @Expose()
  time: string | null;

  @Expose()
  program: string | null;

  @Expose()
  student: string | null;

  @Expose()
  duration: number;

  @Expose()
  rate: string;

  @Expose()
  cost: string;
}

export class UserInvoicedLessonsGroupedByDateDto {
  @Expose()
  invoiceDate: string;

  @Expose()
  lessons: UserInvoicedLessonDto[];

  @Expose()
  totalCost: string;

  @Expose()
  totalDuration: number;
}

export class UserInvoicedLessonsSummaryDto {
  @Expose()
  date: string;

  @Expose()
  duration: number;

  @Expose()
  cost: string;
}

export class UserInvoicedLessonsResponseDto {
  @Expose()
  body: UserInvoicedLessonsGroupedByDateDto[] | UserInvoicedLessonsSummaryDto[];

  @Expose()
  totalCost: string;

  @Expose()
  totalDuration: number;
}
