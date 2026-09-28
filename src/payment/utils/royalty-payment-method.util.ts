import { PaymentMethodType } from '../enums/payment-method-type.enum';

const EXCLUDED_ROYALTY_PAYMENT_METHODS = new Set<number>([
  PaymentMethodType.ACCOUNT_ENTRY,
  PaymentMethodType.CREDIT_USED,
  PaymentMethodType.CREDIT_APPLIED,
  PaymentMethodType.GIFT_CARD,
]);

export function isRoyaltyEligiblePaymentMethod(
  paymentMethodId: number,
): boolean {
  return !EXCLUDED_ROYALTY_PAYMENT_METHODS.has(Number(paymentMethodId));
}
