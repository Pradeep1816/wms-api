import { Expose, Type } from 'class-transformer';

export class ReceivePaymentAppliedSummaryDto {
  @Expose()
  @Type(() => Number)
  fromAmountReceived: number;

  @Expose()
  @Type(() => Number)
  fromInvoiceCredits: number;

  @Expose()
  @Type(() => Number)
  fromPaymentCredits: number;

  @Expose()
  @Type(() => Number)
  totalApplied: number;
}

export class ReceivePaymentResponseDto {
  @Expose()
  status: boolean;

  @Expose()
  paymentId: number | null;

  @Expose()
  @Type(() => Number)
  paymentBalance: number;

  @Expose()
  @Type(() => Number)
  amountReceived: number;

  @Expose()
  @Type(() => ReceivePaymentAppliedSummaryDto)
  applied: ReceivePaymentAppliedSummaryDto;
}

