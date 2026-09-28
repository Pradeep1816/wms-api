import { Expose } from 'class-transformer';

export class LessonPaymentItemDto {
  @Expose()
  id: number;

  @Expose()
  date: string;

  @Expose()
  paymentMethod: string;

  @Expose()
  number: string;

  @Expose()
  amount: string;
}

export class LessonPaymentResponseDto {
  @Expose()
  body: LessonPaymentItemDto[];
}
