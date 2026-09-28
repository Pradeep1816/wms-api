import { Expose } from 'class-transformer';

export class TeacherTimeVoucherLessonDto {
  @Expose()
  id: number;

  @Expose()
  time: string | null;

  @Expose()
  program: string | null;

  @Expose()
  student: string | null;

  @Expose()
  duration: number; // Duration in hours (e.g., 0.5, 0.75)
}

export class TeacherTimeVoucherGroupedByDateDto {
  @Expose()
  date: string;

  @Expose()
  lessons: TeacherTimeVoucherLessonDto[];

  @Expose()
  totalDuration: number; // Total duration in hours for this date
}

export class TeacherTimeVoucherSummaryDto {
  @Expose()
  date: string;

  @Expose()
  duration: number; // Total duration in hours for this date
}

export class TotalDuration {
  @Expose()
  totalDuration: number; // Total duration in hours across all dates
}

export class TeacherTimeVoucherAdjustmentDto {
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

export class TeacherTimeVoucherResponseDto {
  @Expose()
  body: TeacherTimeVoucherGroupedByDateDto[] | TeacherTimeVoucherSummaryDto[];

  @Expose()
  footer: TotalDuration; // Total duration in hours across all dates

  @Expose()
  adjustments?: TeacherTimeVoucherAdjustmentDto[];
}
