import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ReceivePaymentCreditItemDto,
  ReceivePaymentDistributionItemDto,
} from '../../dto/receive-payment-request.dto';
import {
  GroupLessonTargetRow,
  InvoiceCreditSourceRow,
  InvoiceTargetRow,
  PaymentCreditSourceRow,
  PrivateLessonTargetRow,
} from '../../../invoice/repositories/receive-payment.repository';
import {
  CreditWorkItem,
  DistributionWorkItem,
  GroupDistributionWorkItem,
  InvoiceCreditWorkItem,
  InvoiceDistributionWorkItem,
  LessonDistributionWorkItem,
  PaymentCreditWorkItem,
} from './receive-payment.types';
import { roundMoney } from './receive-payment.utils';

@Injectable()
/**
 * Transforms request DTOs and DB lookup rows into mutable work items.
 * Work items track both requested values and remaining balances during allocation.
 */
export class ReceivePaymentWorkBuilderService {
  normalizeDistributionItems(
    items?: ReceivePaymentDistributionItemDto[],
  ): DistributionWorkItem[] {
    if (!items || items.length === 0) {
      return [];
    }

    return items
      .map((item) => ({
        id: Number(item.id),
        requested: roundMoney(Math.max(0, Number(item.value || 0))),
        remainingRequest: roundMoney(Math.max(0, Number(item.value || 0))),
      }))
      .filter((item) => Number.isFinite(item.id) && item.id > 0);
  }

  normalizeCreditItems(items?: ReceivePaymentCreditItemDto[]): CreditWorkItem[] {
    if (!items || items.length === 0) {
      return [];
    }

    return items
      .map((item) => {
        const requested = roundMoney(Math.max(0, Number(item.value || 0)));
        return {
          id: Number(item.id),
          requested,
          remainingCredit: requested,
        };
      })
      .filter((item) => Number.isFinite(item.id) && item.id > 0);
  }

  buildInvoiceWork(
    items: DistributionWorkItem[],
    targets: Map<number, InvoiceTargetRow>,
  ): InvoiceDistributionWorkItem[] {
    return items.map((item) => {
      const target = targets.get(item.id);
      if (!target) {
        throw new NotFoundException(`Invoice ${item.id} not found for this customer/location`);
      }

      return {
        ...item,
        target,
        remainingBalance: roundMoney(Math.max(0, Number(target.balance || 0))),
      };
    });
  }

  buildLessonWork(
    items: DistributionWorkItem[],
    targets: Map<number, PrivateLessonTargetRow>,
  ): LessonDistributionWorkItem[] {
    return items.map((item) => {
      const target = targets.get(item.id);
      if (!target) {
        throw new NotFoundException(`Lesson ${item.id} not found for this customer/location`);
      }

      return {
        ...item,
        target,
        remainingBalance: roundMoney(Math.max(0, Number(target.balance || 0))),
      };
    });
  }

  buildGroupWork(
    items: DistributionWorkItem[],
    targets: Map<number, GroupLessonTargetRow>,
  ): GroupDistributionWorkItem[] {
    return items.map((item) => {
      const target = targets.get(item.id);
      if (!target) {
        throw new NotFoundException(`Group lesson ${item.id} not found for this customer/location`);
      }

      return {
        ...item,
        target,
        remainingBalance: roundMoney(Math.max(0, Number(target.balance || 0))),
      };
    });
  }

  buildInvoiceCreditWork(
    items: CreditWorkItem[],
    sources: Map<number, InvoiceCreditSourceRow>,
  ): InvoiceCreditWorkItem[] {
    return items.map((item) => {
      const source = sources.get(item.id);
      if (!source) {
        throw new NotFoundException(
          `Invoice credit ${item.id} not found for this customer/location`,
        );
      }

      const availableCredit = roundMoney(Math.max(0, Math.abs(Math.min(0, source.balance))));
      return {
        ...item,
        source,
        remainingCredit: roundMoney(Math.min(item.requested, availableCredit)),
      };
    });
  }

  buildPaymentCreditWork(
    items: CreditWorkItem[],
    sources: Map<number, PaymentCreditSourceRow>,
  ): PaymentCreditWorkItem[] {
    return items.map((item) => {
      const source = sources.get(item.id);
      if (!source) {
        throw new NotFoundException(`Payment credit ${item.id} not found for this customer`);
      }

      const availableCredit = roundMoney(Math.max(0, Number(source.balance || 0)));
      return {
        ...item,
        source,
        remainingCredit: roundMoney(Math.min(item.requested, availableCredit)),
      };
    });
  }
}
