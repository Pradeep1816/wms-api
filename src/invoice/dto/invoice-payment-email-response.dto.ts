import { Expose } from 'class-transformer';

export class PaymentEmailTemplateDto {
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

export class InvoicePaidDto {
  @Expose()
  date: string;

  @Expose()
  number: string;

  @Expose()
  amount: string;

  @Expose()
  payment: string;

  @Expose()
  balance: string;
}

export class PaymentUsedDto {
  @Expose()
  reference: string;

  @Expose()
  date: string;

  @Expose()
  paymentMethod: string;

  @Expose()
  amount: string;
}

export class LessonPaidDto {
  @Expose()
  originalDate: string;

  @Expose()
  date: string;

  @Expose()
  student: string;

  @Expose()
  program: string;

  @Expose()
  teacher: string;

  @Expose()
  amount: string;

  @Expose()
  payment: string;

  @Expose()
  balance: string;
}

export class PaymentContentDto {
  @Expose()
  acknowledgment: string;

  @Expose()
  invoices?: InvoicePaidDto[];

  @Expose()
  lessons?: LessonPaidDto[];

  @Expose()
  groupLessons?: LessonPaidDto[];

  @Expose()
  paymentsUsed: PaymentUsedDto[];

  @Expose()
  hstNumber: string | null;
}

export class PaymentEmailBodyDto {
  @Expose()
  content: PaymentContentDto;

  @Expose()
  emailTemplate: PaymentEmailTemplateDto;
}

export class InvoicePaymentEmailDataDto {
  @Expose()
  body: PaymentEmailBodyDto;
}

export class InvoicePaymentEmailResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Payment email retrieved successfully';

  @Expose()
  data: InvoicePaymentEmailDataDto;
}
