import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { calculateRoyaltyAmount } from '../../utils/royality/royalty-calculation.util';
import { InvoicePayment } from '../entities/invoice-payment.entity';
import { RoyaltyTransaction } from '../../payment/entities/royalty-transaction.entity';
import {
  RoyaltyTransactionEventType,
  RoyaltyTransactionSourceType,
} from '../../payment/enums/royalty-transaction.enum';
import { RoyaltyLedgerService } from '../../payment/services/royalty-ledger.service';
import { PaymentRoyaltyRecognitionRepository } from '../../payment/repositories/payment-royalty-recognition.repository';

interface RecordInvoiceReturnRoyaltyInput {
  fractions?: Map<string, { previous: number; next: number; previousTax?: number; nextTax?: number; previousPayment?: number; nextPayment?: number }>;
  originalInvoiceId: number;
  creditInvoiceId: number;
  locationId: number;
  customerId: number;
  effectiveDate: Date;
  createdByUserId: number;
}

export const returnCategoryKey = (value: { itemCategoryId?: number | null; rateApplied: number; advertisementRateApplied?: number; royaltyFree: number | boolean; isPos?: boolean; categoryName?: string }) =>
  [Number(value.itemCategoryId || 0), Number(value.rateApplied), Number(value.advertisementRateApplied || 0), Number(value.royaltyFree), Number(Boolean(value.isPos)), value.isPos ? value.categoryName || 'Uncategorized' : ''].join(':');

interface ReturnClassification {
  invoicePayment: InvoicePayment;
  destination: RoyaltyTransaction;
  restoredSource: RoyaltyTransaction;
  restoredPaymentAmount: number;
  restoredRevenueAmount: number;
  restoredTaxAmount: number;
  restoredRoyaltyAmount: number;
  restoredAdvertisementAmount: number;
  destinationPaymentAmount: number;
  destinationRevenueAmount: number;
  destinationTaxAmount: number;
  destinationRoyaltyAmount: number;
  destinationAdvertisementAmount: number;
}

@Injectable()
export class InvoiceReturnRoyaltyService {
  constructor(
    private readonly royaltyLedgerService: RoyaltyLedgerService,
    private readonly recognitionRepository: PaymentRoyaltyRecognitionRepository,
  ) {}

  async recordInvoiceReturn(
    manager: EntityManager,
    input: RecordInvoiceReturnRoyaltyInput,
  ): Promise<void> {
    const invoicePayments = await manager.getRepository(InvoicePayment).find({
      where: {
        invoiceId: input.originalInvoiceId,
        isDeleted: 0,
      },
      order: { id: 'ASC' },
    });

    for (const invoicePayment of invoicePayments) {
      const classifications = await this.findClassifications(
        manager,
        invoicePayment,
        input.locationId,
      );
      const paymentPurposes = input.fractions
        ? await this.recognitionRepository.getAllocationPurposes(manager, RoyaltyTransactionSourceType.INVOICE_PAYMENT, invoicePayment.id, input.locationId)
        : [];
      for (const classification of classifications) {
        if (input.fractions) {
          const fraction = input.fractions.get(returnCategoryKey(classification.destination));
          if (!fraction) continue;
          const purpose = paymentPurposes.find(p => returnCategoryKey(p) === returnCategoryKey(classification.destination));
          // Revenue/fees, tax, and gross payment have distinct return shares.
          // Two books in one category can have different tax statuses. A net-only
          // fraction would incorrectly return tax for a tax-free book.
          for (const key of Object.keys(classification).filter(key => key.endsWith('Amount'))) {
            const restoreDifferentSource = key.startsWith('restored') && classification.restoredSource.id !== classification.destination.id;
            const kind = restoreDifferentSource || key.endsWith('PaymentAmount') ? 'payment' : key.endsWith('TaxAmount') ? 'tax' : 'revenue';
            const originalRevenue = Number(purpose?.returnOriginalRevenue || 0);
            const originalTax = Number(purpose?.returnOriginalTax || 0);
            const previousRevenue = Number(purpose?.returnPreviousRevenue || 0);
            const previousTax = Number(purpose?.returnPreviousTax || 0);
            const original = kind === 'tax' ? originalTax : kind === 'payment' ? originalRevenue + originalTax : originalRevenue;
            const returned = kind === 'tax' ? previousTax : kind === 'payment' ? previousRevenue + previousTax : previousRevenue;
            const baseline = kind === 'tax' && purpose?.returnOriginalTax === undefined
              ? originalRevenue ? previousRevenue / originalRevenue : 0
              : original ? returned / original : 0;
            const fractionPrevious = kind === 'tax' ? fraction.previousTax ?? fraction.previous : kind === 'payment' ? fraction.previousPayment ?? fraction.previous : fraction.previous;
            const fractionNext = kind === 'tax' ? fraction.nextTax ?? fraction.next : kind === 'payment' ? fraction.nextPayment ?? fraction.next : fraction.next;
            const previous = baseline < 1 ? Math.max(0, (fractionPrevious - baseline) / (1 - baseline)) : 0;
            const next = baseline < 1 ? Math.min(1, Math.max(0, (fractionNext - baseline) / (1 - baseline))) : 0;
            const digits = /Royalty|Advertisement/.test(key) ? 2 : 4;
            const round = (value: number) => Math.round((value + Number.EPSILON) * 10 ** digits) / 10 ** digits;
            classification[key] = round(classification[key] * next) - round(classification[key] * previous);
          }
        }
        await this.recordClassificationReturn(manager, input, classification);
      }
    }
  }

  private async findClassifications(
    manager: EntityManager,
    invoicePayment: InvoicePayment,
    locationId: number,
  ): Promise<ReturnClassification[]> {
    const repository = manager.getRepository(RoyaltyTransaction);
    const [transferIns, allocations] = await Promise.all([
      repository.find({
        where: {
          sourceType: RoyaltyTransactionSourceType.INVOICE_PAYMENT,
          sourceId: invoicePayment.id,
          eventType: RoyaltyTransactionEventType.TRANSFER_IN,
        },
        order: { id: 'ASC' },
      }),
      repository.find({
        where: {
          sourceType: RoyaltyTransactionSourceType.INVOICE_PAYMENT,
          sourceId: invoicePayment.id,
          eventType: RoyaltyTransactionEventType.ALLOCATION,
        },
        order: { id: 'ASC' },
      }),
    ]);

    const classifications: ReturnClassification[] = [];
    for (const destination of transferIns) {
      const transferOut = destination.relatedRoyaltyTransactionId
        ? await repository.findOne({
            where: { id: destination.relatedRoyaltyTransactionId },
          })
        : null;
      const restoredSource = transferOut?.relatedRoyaltyTransactionId
        ? await repository.findOne({
            where: { id: transferOut.relatedRoyaltyTransactionId },
          })
        : null;
      if (!transferOut || !restoredSource) {
        continue;
      }
      classifications.push({
        invoicePayment,
        destination,
        restoredSource,
        restoredPaymentAmount: Math.abs(Number(transferOut.paymentAmount)),
        restoredRevenueAmount: Math.abs(Number(transferOut.revenueAmount)),
        restoredTaxAmount: Math.abs(Number(transferOut.taxAmount)),
        restoredRoyaltyAmount: Math.abs(Number(transferOut.royaltyAmount)),
        restoredAdvertisementAmount: Math.abs(
          Number(transferOut.advertisementAmount || 0),
        ),
        destinationPaymentAmount: Math.abs(Number(destination.paymentAmount)),
        destinationRevenueAmount: Math.abs(Number(destination.revenueAmount)),
        destinationTaxAmount: Math.abs(Number(destination.taxAmount)),
        destinationRoyaltyAmount: Math.abs(Number(destination.royaltyAmount)),
        destinationAdvertisementAmount: Math.abs(
          Number(destination.advertisementAmount || 0),
        ),
      });
    }

    for (const allocation of allocations) {
      const restoredSource = allocation.relatedRoyaltyTransactionId
        ? await repository.findOne({
            where: { id: allocation.relatedRoyaltyTransactionId },
          })
        : null;
      if (!restoredSource) {
        continue;
      }
      const revenueAmount = Math.abs(Number(allocation.revenueAmount));
      classifications.push({
        invoicePayment,
        destination: restoredSource,
        restoredSource,
        restoredPaymentAmount: Math.abs(Number(allocation.paymentAmount)),
        restoredRevenueAmount: revenueAmount,
        restoredTaxAmount: Math.abs(Number(allocation.taxAmount)),
        restoredAdvertisementAmount: calculateRoyaltyAmount(
          revenueAmount,
          restoredSource.royaltyFree
            ? 0
            : restoredSource.advertisementRateApplied,
        ),
        restoredRoyaltyAmount: calculateRoyaltyAmount(
          revenueAmount,
          restoredSource.royaltyFree ? 0 : restoredSource.rateApplied,
        ),
        destinationPaymentAmount: Math.abs(Number(allocation.paymentAmount)),
        destinationRevenueAmount: revenueAmount,
        destinationTaxAmount: Math.abs(Number(allocation.taxAmount)),
        destinationAdvertisementAmount: calculateRoyaltyAmount(
          revenueAmount,
          restoredSource.royaltyFree
            ? 0
            : restoredSource.advertisementRateApplied,
        ),
        destinationRoyaltyAmount: calculateRoyaltyAmount(
          revenueAmount,
          restoredSource.royaltyFree ? 0 : restoredSource.rateApplied,
        ),
      });
    }

    if (transferIns.length > 0 || allocations.length > 0) {
      return classifications;
    }

    const [directRecognitions, purposes] = await Promise.all([
      repository.find({
        where: {
          paymentId: invoicePayment.paymentId,
          eventType: RoyaltyTransactionEventType.PAYMENT_RECEIVED,
          sourceType: RoyaltyTransactionSourceType.INVOICE_PAYMENT,
        },
        order: { id: 'ASC' },
      }),
      this.recognitionRepository.getAllocationPurposes(
        manager,
        RoyaltyTransactionSourceType.INVOICE_PAYMENT,
        invoicePayment.id,
        locationId,
      ),
    ]);
    for (const purpose of purposes) {
      const recognition = directRecognitions.find(
        (candidate) =>
          Number(candidate.itemCategoryId) === Number(purpose.itemCategoryId) &&
          Number(candidate.rateApplied) === Number(purpose.rateApplied) &&
          Number(candidate.advertisementRateApplied ?? 0) ===
            Number(purpose.advertisementRateApplied ?? 0) &&
          Boolean(candidate.royaltyFree) === Boolean(purpose.royaltyFree) &&
          Boolean(candidate.isPos) === Boolean(purpose.isPos) &&
          (!purpose.isPos || candidate.categoryName === purpose.categoryName),
      );
      if (!recognition) {
        continue;
      }
      const royaltyAmount = calculateRoyaltyAmount(
        purpose.revenueAmount,
        purpose.royaltyFree ? 0 : purpose.rateApplied,
      );
      classifications.push({
        invoicePayment,
        destination: recognition,
        restoredSource: recognition,
        restoredPaymentAmount: Number(purpose.paymentAmount),
        restoredRevenueAmount: Number(purpose.revenueAmount),
        restoredTaxAmount: Number(purpose.taxAmount),
        restoredRoyaltyAmount: royaltyAmount,
        restoredAdvertisementAmount: calculateRoyaltyAmount(
          purpose.revenueAmount,
          purpose.royaltyFree ? 0 : purpose.advertisementRateApplied,
        ),
        destinationPaymentAmount: Number(purpose.paymentAmount),
        destinationRevenueAmount: Number(purpose.revenueAmount),
        destinationTaxAmount: Number(purpose.taxAmount),
        destinationRoyaltyAmount: royaltyAmount,
        destinationAdvertisementAmount: calculateRoyaltyAmount(
          purpose.revenueAmount,
          purpose.royaltyFree ? 0 : purpose.advertisementRateApplied,
        ),
      });
    }
    return classifications;
  }

  private async recordClassificationReturn(
    manager: EntityManager,
    input: RecordInvoiceReturnRoyaltyInput,
    classification: ReturnClassification,
  ): Promise<void> {
    const { destination, restoredSource, invoicePayment } = classification;
    const eventGroupId = `invoice-return:${input.creditInvoiceId}:${invoicePayment.id}`;
    const transferOut = await this.royaltyLedgerService.recordEvent(manager, {
      paymentId: invoicePayment.paymentId,
      originalPaymentId:
        destination.originalPaymentId || invoicePayment.paymentId,
      locationId: input.locationId,
      customerId: input.customerId,
      itemCategoryId: destination.itemCategoryId,
      categoryName: destination.categoryName,
      isPos: destination.isPos,
      rateApplied: destination.rateApplied,
      advertisementRateApplied: destination.advertisementRateApplied,
      paymentAmount: -classification.destinationPaymentAmount,
      revenueAmount: -classification.destinationRevenueAmount,
      taxAmount: -classification.destinationTaxAmount,
      royaltyAmount: -classification.destinationRoyaltyAmount,
      advertisementAmount: -classification.destinationAdvertisementAmount,
      royaltyFree: destination.royaltyFree,
      eventType: RoyaltyTransactionEventType.TRANSFER_OUT,
      effectiveDate: input.effectiveDate,
      sourceType: RoyaltyTransactionSourceType.INVOICE_RETURN,
      sourceId: input.creditInvoiceId,
      relatedRoyaltyTransactionId: destination.id,
      eventGroupId,
      idempotencyKey: `royalty:invoice-return:out:${input.creditInvoiceId}:${invoicePayment.id}:${destination.id}`,
      reason: `Invoice ${input.originalInvoiceId} returned`,
      createdByUserId: input.createdByUserId,
    });

    await this.royaltyLedgerService.recordEvent(manager, {
      paymentId: invoicePayment.paymentId,
      originalPaymentId:
        restoredSource.originalPaymentId || invoicePayment.paymentId,
      locationId: input.locationId,
      customerId: input.customerId,
      itemCategoryId: restoredSource.itemCategoryId,
      categoryName: restoredSource.categoryName,
      isPos: restoredSource.isPos,
      rateApplied: restoredSource.rateApplied,
      advertisementRateApplied: restoredSource.advertisementRateApplied,
      paymentAmount: classification.restoredPaymentAmount,
      revenueAmount: classification.restoredRevenueAmount,
      taxAmount: classification.restoredTaxAmount,
      royaltyAmount: classification.restoredRoyaltyAmount,
      advertisementAmount: classification.restoredAdvertisementAmount,
      royaltyFree: restoredSource.royaltyFree,
      eventType: RoyaltyTransactionEventType.TRANSFER_IN,
      effectiveDate: input.effectiveDate,
      sourceType: RoyaltyTransactionSourceType.INVOICE_RETURN,
      sourceId: input.creditInvoiceId,
      relatedRoyaltyTransactionId: transferOut.id,
      eventGroupId,
      idempotencyKey: `royalty:invoice-return:credit:${input.creditInvoiceId}:${invoicePayment.id}:${destination.id}`,
      reason: `Royalty classification restored to returned invoice credit ${input.creditInvoiceId}`,
      createdByUserId: input.createdByUserId,
    });
  }
}
