import { Expose } from 'class-transformer';

export class TeacherInvoicedLessonDto {
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

export class TeacherInvoicedLessonsGroupedByDateDto {
  @Expose()
  invoiceDate: string;

  @Expose()
  lessons: TeacherInvoicedLessonDto[];

  @Expose()
  totalCost: string;

  @Expose()
  totalDuration: number;
}

export class TeacherInvoicedLessonsSummaryDto {
  @Expose()
  date: string;

  @Expose()
  duration: number;

  @Expose()
  cost: string;
}

export class TeacherInvoicedLessonsAdjustmentDto {
  @Expose()
  id: number;

  @Expose()
  documentType: string;

  @Expose()
  startDate: string;

  @Expose()
  endDate: string;

  @Expose()
  label: string;

  @Expose()
  minimumHours: number;

  @Expose()
  actualHours: number;

  @Expose()
  adjustmentHours: number;

  @Expose()
  hourlyRate: number | null;

  @Expose()
  adjustmentAmount: number | null;

  @Expose()
  note: string | null;
}

export class TeacherInvoicedLessonsResponseDto {
  @Expose()
  body:
    | TeacherInvoicedLessonsGroupedByDateDto[]
    | TeacherInvoicedLessonsSummaryDto[];

  @Expose()
  totalCost: string;

  @Expose()
  totalDuration: number;

  @Expose()
  adjustments?: TeacherInvoicedLessonsAdjustmentDto[];
}
