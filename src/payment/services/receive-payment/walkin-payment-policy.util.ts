import { BadRequestException } from '@nestjs/common';
import { roundMoney } from './receive-payment.utils';

/** Shared walk-in records represent different buyers; their credit is not pooled tender. */
export function assertWalkinPurchaseAllocation(input: {
  amount: number;
  invoices: { id: number; requested: number }[];
  hasCredits: boolean;
  hasOtherCharges: boolean;
}): void {
  if (input.hasCredits)
    throw new BadRequestException(
      'Walk-in purchases require a new payment. Uncheck customer credits; credit on this shared account may belong to another buyer.',
    );
  if (
    input.amount <= 0 ||
    input.invoices.length !== 1 ||
    input.hasOtherCharges ||
    roundMoney(input.invoices[0].requested) !== input.amount
  ) {
    throw new BadRequestException(
      'For a walk-in customer, select one invoice and enter the amount being applied to that invoice.',
    );
  }
}
