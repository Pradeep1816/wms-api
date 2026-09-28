import {
  GroupLessonTargetRow,
  InvoiceCreditSourceRow,
  InvoiceTargetRow,
  PaymentCreditSourceRow,
  PrivateLessonTargetRow,
} from '../../../invoice/repositories/receive-payment.repository';
import { RoyaltyTransactionSourceType } from '../../enums/royalty-transaction.enum';

export interface DistributionWorkItem {
  id: number;
  requested: number;
  remainingRequest: number;
}

export interface InvoiceDistributionWorkItem extends DistributionWorkItem {
  target: InvoiceTargetRow;
  remainingBalance: number;
}

export interface LessonDistributionWorkItem extends DistributionWorkItem {
  target: PrivateLessonTargetRow;
  remainingBalance: number;
}

export interface GroupDistributionWorkItem extends DistributionWorkItem {
  target: GroupLessonTargetRow;
  remainingBalance: number;
}

export interface CreditWorkItem {
  id: number;
  requested: number;
  remainingCredit: number;
}

export interface InvoiceCreditWorkItem extends CreditWorkItem {
  source: InvoiceCreditSourceRow;
}

export interface PaymentCreditWorkItem extends CreditWorkItem {
  source: PaymentCreditSourceRow;
}

export interface GroupLessonKey {
  lessonId: number;
  enrolmentId: number;
}

export interface RoyaltyCreditAllocation {
  originalPaymentId: number;
  sourceType: RoyaltyTransactionSourceType;
  allocationId: number;
  amount: number;
}

export interface RoyaltyInvoiceCreditAllocation {
  invoiceCreditId: number;
  sourceType: RoyaltyTransactionSourceType;
  allocationId: number;
  amount: number;
}

export interface ReceivePaymentAuditContext {
  locationSlug: string;
  locationId: number;
  customerId: number;
  currentUserId: number;
  paymentDate: Date;
  amountReceived: number;
  appliedFromAmountReceived: number;
  appliedFromInvoiceCredits: number;
  appliedFromPaymentCredits: number;
  affectedInvoiceIds: number[];
  affectedPrivateLessonIds: number[];
  affectedGroupLessonKeys: GroupLessonKey[];
  affectedPaymentIds: number[];
  paymentCreditInvoiceId?: number | null;
}

export interface ReceivePaymentSaveResult {
  response: import('../../dto/receive-payment-response.dto').ReceivePaymentResponseDto;
  auditContext: ReceivePaymentAuditContext;
}
