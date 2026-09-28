import { Expose } from 'class-transformer';

export class PaymentMethodDataDto {
  @Expose()
  id: number;

  @Expose()
  name: string;
}

export class PaymentMethodResponseDto {
  @Expose()
  body: PaymentMethodDataDto[];  
}


