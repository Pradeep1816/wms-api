import { Expose } from 'class-transformer';

export class InvoiceMessageInfo {
  @Expose()
  id: number;

  @Expose()
  message: string;
}

export class InvoiceMessageResponse {
  @Expose()
  body: InvoiceMessageInfo;
}
