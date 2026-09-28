import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ReceivePaymentRequestDto } from '../../dto/receive-payment-request.dto';
import { ReceivePaymentRepository } from '../../../invoice/repositories/receive-payment.repository';
import { GroupLessonKey } from './receive-payment.types';
import { roundMoney, uniqueIds } from './receive-payment.utils';
import { ReceivePaymentPaymentFactoryService } from './receive-payment-payment-factory.service';
import { ReceivePaymentPostProcessorService } from './receive-payment-post-processor.service';
import { ReceivePaymentValidationService } from './receive-payment-validation.service';
import { ReceivePaymentWorkBuilderService } from './receive-payment-work-builder.service';
import { ReceivePaymentSaveResult } from './receive-payment.types';
import { PaymentRoyaltyAdjustmentService } from '../payment-royalty-adjustment.service';

interface SaveNegativeReceivePaymentInput {
  manager: EntityManager;
  locationSlug: string;
  locationId: number;
  dto: ReceivePaymentRequestDto;
  currentUserId: number;
  paymentDate: Date;
  amountReceived: number;
}

@Injectable()
/**
 * Handles the legacy negative-receive-payment flow (`addNegativePayment`):
 * 1) apply negative payment against invoice credits
 * 2) optionally transfer payment credits through a payment-credit invoice.
 */
export class ReceivePaymentNegativeService {
  constructor(
    private readonly receivePaymentRepository: ReceivePaymentRepository,
    private readonly receivePaymentValidationService: ReceivePaymentValidationService,
    private readonly receivePaymentWorkBuilderService: ReceivePaymentWorkBuilderService,
    private readonly receivePaymentPaymentFactoryService: ReceivePaymentPaymentFactoryService,
    private readonly receivePaymentPostProcessorService: ReceivePaymentPostProcessorService,
    private readonly paymentRoyaltyAdjustmentService: PaymentRoyaltyAdjustmentService,
  ) {}

  async saveNegativeReceivePayment(
    input: SaveNegativeReceivePaymentInput,
  ): Promise<ReceivePaymentSaveResult> {
    const {
      manager,
      locationSlug,
      locationId,
      dto,
      currentUserId,
      paymentDate,
      amountReceived,
    } = input;

    if (amountReceived >= 0) {
      throw new BadRequestException('Negative receive payment amount expected');
    }

    if (!dto.paymentMethodId) {
      throw new BadRequestException('Payment Method cannot be blank.');
    }

    const invoiceDistributions =
      this.receivePaymentWorkBuilderService.normalizeDistributionItems(dto.invoicePayments);
    const lessonDistributions =
      this.receivePaymentWorkBuilderService.normalizeDistributionItems(dto.lessonPayments);
    const groupDistributions =
      this.receivePaymentWorkBuilderService.normalizeDistributionItems(dto.groupLessonPayments);

    const canUseInvoiceCredits =
      dto.canUseInvoiceCredits !== undefined
        ? Boolean(Number(dto.canUseInvoiceCredits))
        : (dto.invoiceCredits?.length || 0) > 0;

    const canUsePaymentCredits =
      dto.canUsePaymentCredits !== undefined
        ? Boolean(Number(dto.canUsePaymentCredits))
        : (dto.paymentCredits?.length || 0) > 0;

    const invoiceCredits = canUseInvoiceCredits
      ? this.receivePaymentWorkBuilderService.normalizeCreditItems(dto.invoiceCredits)
      : [];
    const paymentCredits = canUsePaymentCredits
      ? this.receivePaymentWorkBuilderService.normalizeCreditItems(dto.paymentCredits)
      : [];

    // Legacy parity: validate distribution totals BEFORE negative flow checks
    // This ensures "Amount mismatched with distributions" error appears first
    this.receivePaymentValidationService.validateRequestedDistributionTotals(
      amountReceived,
      invoiceDistributions,
      lessonDistributions,
      groupDistributions,
      invoiceCredits,
      paymentCredits,
    );

    this.receivePaymentValidationService.validateNegativeFlowSelections(
      invoiceDistributions,
      lessonDistributions,
      groupDistributions,
      invoiceCredits,
      paymentCredits,
    );

    const invoiceCreditSources =
      await this.receivePaymentRepository.findInvoiceCreditSourcesForCustomer(
        uniqueIds(invoiceCredits),
        dto.customerId,
        locationId,
        manager,
      );
    const paymentCreditSources =
      await this.receivePaymentRepository.findPaymentCreditSourcesForCustomer(
        uniqueIds(paymentCredits),
        dto.customerId,
        manager,
      );

    const invoiceCreditWork = this.receivePaymentWorkBuilderService.buildInvoiceCreditWork(
      invoiceCredits,
      invoiceCreditSources,
    );
    const paymentCreditWork = this.receivePaymentWorkBuilderService.buildPaymentCreditWork(
      paymentCredits,
      paymentCreditSources,
    );

    const negativePayment =
      await this.receivePaymentPaymentFactoryService.createPaymentWithTransaction(
        manager,
        currentUserId,
        dto.customerId,
        dto.paymentMethodId,
        amountReceived,
        amountReceived,
        paymentDate,
        dto.reference || '',
        dto.notes || '',
      );

    const paymentId = negativePayment.id;
    let remainingToOffset = roundMoney(Math.abs(amountReceived));
    let appliedFromInvoiceCredits = 0;
    let appliedFromPaymentCredits = 0;

    const affectedInvoiceIds = new Set<number>();
    const affectedPrivateLessonIds = new Set<number>();
    const affectedGroupLessonKeys = new Map<string, GroupLessonKey>();
    const affectedPaymentIds = new Set<number>([paymentId]);
    const refundedInvoiceCredits = new Map<number, number>();
    const refundedPaymentCredits = new Map<number, number>();

    for (const credit of invoiceCreditWork) {
      if (remainingToOffset <= 0) {
        break;
      }

      const amountToApply = roundMoney(
        Math.min(remainingToOffset, credit.remainingCredit),
      );
      if (amountToApply <= 0) {
        continue;
      }

      await this.receivePaymentRepository.createInvoicePayment(
        credit.source.id,
        paymentId,
        -amountToApply,
        currentUserId,
        manager,
      );

      credit.remainingCredit = roundMoney(credit.remainingCredit - amountToApply);
      remainingToOffset = roundMoney(remainingToOffset - amountToApply);
      appliedFromInvoiceCredits = roundMoney(appliedFromInvoiceCredits + amountToApply);
      affectedInvoiceIds.add(credit.source.id);
      refundedInvoiceCredits.set(
        credit.source.id,
        roundMoney(
          (refundedInvoiceCredits.get(credit.source.id) || 0) + amountToApply,
        ),
      );
    }

    let paymentCreditInvoiceId: number | null = null;
    for (const credit of paymentCreditWork) {
      if (remainingToOffset <= 0) {
        break;
      }

      const requestedCreditValue = roundMoney(credit.requested);
      const amountToApply = roundMoney(
        Math.min(remainingToOffset, requestedCreditValue),
      );
      if (amountToApply <= 0) {
        continue;
      }

      if (!paymentCreditInvoiceId) {
        const paymentCreditInvoice =
          await this.receivePaymentRepository.createPaymentCreditInvoiceWithLineItem(
            dto.customerId,
            locationId,
            currentUserId,
            manager,
          );
        paymentCreditInvoiceId = paymentCreditInvoice.id;
        affectedInvoiceIds.add(paymentCreditInvoiceId);
      }

      // Legacy parity: the transfer rows use the raw requested credit value,
      // while the running offset uses the capped amountToApply.
      const mappedAmount = requestedCreditValue;
      await this.receivePaymentRepository.createInvoicePayment(
        paymentCreditInvoiceId,
        paymentId,
        -mappedAmount,
        currentUserId,
        manager,
      );
      await this.receivePaymentRepository.createInvoicePayment(
        paymentCreditInvoiceId,
        credit.source.id,
        mappedAmount,
        currentUserId,
        manager,
      );

      credit.remainingCredit = roundMoney(
        Math.max(0, credit.remainingCredit - amountToApply),
      );
      remainingToOffset = roundMoney(remainingToOffset - amountToApply);
      appliedFromPaymentCredits = roundMoney(appliedFromPaymentCredits + amountToApply);
      affectedPaymentIds.add(credit.source.id);
      refundedPaymentCredits.set(
        credit.source.id,
        roundMoney(
          (refundedPaymentCredits.get(credit.source.id) || 0) + amountToApply,
        ),
      );
    }

    const paymentBalance = await this.receivePaymentPostProcessorService.recalculateAndPersist({
      manager,
      locationSlug,
      customerId: dto.customerId,
      currentUserId,
      paymentId,
      affectedInvoiceIds,
      affectedPrivateLessonIds,
      affectedGroupLessonKeys,
      affectedPaymentIds,
    });

    const totalApplied = roundMoney(appliedFromInvoiceCredits + appliedFromPaymentCredits);
    const refundAllocations = this.groupRefundAllocations(
      dto.royaltyRefundAllocations || [],
      refundedPaymentCredits,
    );

    for (const [invoiceCreditId, amount] of refundedInvoiceCredits) {
      await this.paymentRoyaltyAdjustmentService.recordInvoiceCreditRefund(
        manager,
        {
          invoiceCreditId,
          refundPaymentId: paymentId,
          locationId,
          customerId: dto.customerId,
          amount,
          effectiveDate: paymentDate,
          reason: dto.notes || dto.reference || 'Returned invoice credit refunded',
          createdByUserId: currentUserId,
        },
      );
    }

    for (const [originalPaymentId, amount] of refundedPaymentCredits) {
      await this.paymentRoyaltyAdjustmentService.recordCreditRefund(manager, {
        originalPaymentId,
        refundPaymentId: paymentId,
        locationId,
        customerId: dto.customerId,
        amount,
        effectiveDate: paymentDate,
        reason: dto.notes || dto.reference || 'Customer credit refunded',
        createdByUserId: currentUserId,
        categoryAllocations: refundAllocations.get(originalPaymentId),
      });
    }

    return {
      response: {
        status: true,
        paymentId,
        paymentBalance: roundMoney(paymentBalance),
        amountReceived: roundMoney(amountReceived),
        applied: {
          fromAmountReceived: roundMoney(-totalApplied),
          fromInvoiceCredits: roundMoney(appliedFromInvoiceCredits),
          fromPaymentCredits: roundMoney(appliedFromPaymentCredits),
          totalApplied,
        },
      },
      auditContext: {
        locationSlug,
        locationId,
        customerId: dto.customerId,
        currentUserId,
        paymentDate,
        amountReceived,
        appliedFromAmountReceived: -totalApplied,
        appliedFromInvoiceCredits,
        appliedFromPaymentCredits,
        affectedInvoiceIds: Array.from(affectedInvoiceIds),
        affectedPrivateLessonIds: Array.from(affectedPrivateLessonIds),
        affectedGroupLessonKeys: Array.from(affectedGroupLessonKeys.values()),
        affectedPaymentIds: Array.from(affectedPaymentIds),
        paymentCreditInvoiceId,
      },
    };
  }

  private groupRefundAllocations(
    allocations: NonNullable<ReceivePaymentRequestDto['royaltyRefundAllocations']>,
    refundedPaymentCredits: Map<number, number>,
  ): Map<number, Array<{ itemCategoryId: number; amount: number }>> {
    const grouped = new Map<
      number,
      Array<{ itemCategoryId: number; amount: number }>
    >();
    const allocationKeys = new Set<string>();

    for (const allocation of allocations) {
      const originalPaymentId = Number(allocation.originalPaymentId);
      const itemCategoryId = Number(allocation.itemCategoryId);
      const amount = roundMoney(Number(allocation.amount));
      if (
        !Number.isFinite(originalPaymentId) ||
        !Number.isFinite(itemCategoryId) ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        throw new BadRequestException(
          'Refund royalty category allocations must contain valid positive amounts',
        );
      }
      if (!refundedPaymentCredits.has(originalPaymentId)) {
        throw new BadRequestException(
          `Payment ${originalPaymentId} is not part of this credit refund`,
        );
      }

      const key = `${originalPaymentId}:${itemCategoryId}`;
      if (allocationKeys.has(key)) {
        throw new BadRequestException(
          'Each refund royalty category can appear only once per payment',
        );
      }
      allocationKeys.add(key);
      grouped.set(originalPaymentId, [
        ...(grouped.get(originalPaymentId) || []),
        { itemCategoryId, amount },
      ]);
    }

    for (const [originalPaymentId, paymentAllocations] of grouped) {
      const refundedAmount = refundedPaymentCredits.get(originalPaymentId) || 0;
      const allocatedAmount = roundMoney(
        paymentAllocations.reduce(
          (sum, allocation) => sum + allocation.amount,
          0,
        ),
      );
      if (Math.abs(allocatedAmount - refundedAmount) > 0.01) {
        throw new BadRequestException(
          `Refund royalty category amounts must equal ${refundedAmount.toFixed(2)} for payment ${originalPaymentId}`,
        );
      }
    }
    return grouped;
  }
}
