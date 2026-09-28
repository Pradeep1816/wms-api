import { Expose, Transform } from 'class-transformer';
import { formatCurrency } from '../../utils/formatters';

export class ReceivePaymentLessonResponseDto {
  @Expose()
  id: number;

  @Expose()
  date: string;
  @Expose()
  dueDate: string;

  @Expose()
  studentName: string;

  @Expose()
  programName: string;

  @Expose()
  teacherName: string;

  @Expose()
  @Transform(({ value }) => formatCurrency(value))
  total: number;

  @Expose()
  @Transform(({ value }) => formatCurrency(value))
  balance: number;

  @Expose()
  @Transform(({ value }) => formatCurrency(value))
  payments: number;
}

export class ReceivePaymentLessonDataDto {
  @Expose()
  body: ReceivePaymentLessonResponseDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

