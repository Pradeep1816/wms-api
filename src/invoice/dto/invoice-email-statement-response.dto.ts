import { Expose } from 'class-transformer';

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

export class InvoiceContentDto {
  @Expose()
  lineItems: any[];

  @Expose()
  message: string | null;

  @Expose()
  payments?: any[]; // Optional - only if invoice has payments

  @Expose()
  totals: any;

  @Expose()
  hstNumber: string | null;
}

export class InvoiceEmailBodyDto {
  @Expose()
  content: InvoiceContentDto;

  @Expose()
  emailTemplate: EmailTemplateDto;
}

export class InvoiceEmailStatementDataDto {
  @Expose()
  body: InvoiceEmailBodyDto;
}

export class InvoiceEmailStatementResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Invoice email statement retrieved successfully';

  @Expose()
  data: InvoiceEmailStatementDataDto;
}
