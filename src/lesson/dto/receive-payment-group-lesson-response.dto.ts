import { Expose, Transform } from 'class-transformer';
import { formatCurrency } from '../../utils/formatters';

export class ReceivePaymentGroupLessonResponseDto {
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

export class ReceivePaymentGroupLessonDataDto {
  @Expose()
  body: ReceivePaymentGroupLessonResponseDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
