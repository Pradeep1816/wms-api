import { BadRequestException, Injectable } from '@nestjs/common';
import { assertWalkinPurchaseAllocation } from './receive-payment/walkin-payment-policy.util';
import { DataSource } from 'typeorm';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';
import {
  ReceivePaymentRequestDto,
} from '../dto/receive-payment-request.dto';
import { ReceivePaymentResponseDto } from '../dto/receive-payment-response.dto';
import { ReceivePaymentRepository } from '../../invoice/repositories/receive-payment.repository';
import {
  GroupLessonKey,
  RoyaltyCreditAllocation,
  RoyaltyInvoiceCreditAllocation,
} from './receive-payment/receive-payment.types';
import { roundMoney, uniqueIds } from './receive-payment/receive-payment.utils';
import { ReceivePaymentCashApplierService } from './receive-payment/receive-payment-cash-applier.service';
import { ReceivePaymentCreditApplierService } from './receive-payment/receive-payment-credit-applier.service';
import { ReceivePaymentPaymentFactoryService } from './receive-payment/receive-payment-payment-factory.service';
import { ReceivePaymentPostProcessorService } from './receive-payment/receive-payment-post-processor.service';
import { ReceivePaymentValidationService } from './receive-payment/receive-payment-validation.service';
import { ReceivePaymentWorkBuilderService } from './receive-payment/receive-payment-work-builder.service';
import { ReceivePaymentNegativeService } from './receive-payment/receive-payment-negative.service';
import { ReceivePaymentSaveResult } from './receive-payment/receive-payment.types';
import { PaymentRoyaltyRecognitionService } from './payment-royalty-recognition.service';
import { isRoyaltyEligiblePaymentMethod } from '../utils/royalty-payment-method.util';
import { PaymentRoyaltyAdjustmentService } from './payment-royalty-adjustment.service';

@Injectable()
/**
 * Orchestrates the legacy-equivalent "save receive payment" flow.
 * The helper services contain the detailed rules, while this class keeps
 * the business sequence readable end-to-end inside one DB transaction.
 */
export class InvoiceReceivePaymentService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly customerValidationService: CustomerValidationService,
    private readonly receivePaymentRepository: ReceivePaymentRepository,
    private readonly receivePaymentValidationService: ReceivePaymentValidationService,
    private readonly receivePaymentWorkBuilderService: ReceivePaymentWorkBuilderService,
    private readonly receivePaymentPaymentFactoryService: ReceivePaymentPaymentFactoryService,
    private readonly receivePaymentCreditApplierService: ReceivePaymentCreditApplierService,
    private readonly receivePaymentCashApplierService: ReceivePaymentCashApplierService,
    private readonly receivePaymentPostProcessorService: ReceivePaymentPostProcessorService,
    private readonly receivePaymentNegativeService: ReceivePaymentNegativeService,
    private readonly paymentRoyaltyRecognitionService: PaymentRoyaltyRecognitionService,
    private readonly paymentRoyaltyAdjustmentService: PaymentRoyaltyAdjustmentService,
  ) {}

  async getCheckoutPolicy(slug: string, customerId: number) {
    const { locationId } = await this.customerValidationService.validateLocationAndCustomer(slug, customerId);
    const rows = await this.dataSource.query('SELECT id FROM location_walkin_customer WHERE locationId=? AND customerId=? LIMIT 1', [locationId, customerId]);
    return { isSharedWalkIn: rows.length > 0 };
  }

  async saveReceivePayment(
    locationSlug: string,
    dto: ReceivePaymentRequestDto,
    currentUserId: number,
    isAdmin: boolean,
  ): Promise<ReceivePaymentResponseDto> {
    // Step 1: Validate request-level rules and normalize raw numbers.
    const amountReceived = roundMoney(dto.amount);
    this.receivePaymentValidationService.validateAmountAndMethod(
      amountReceived,
      dto.paymentMethodId,
    );

    const paymentDate = this.receivePaymentValidationService.parsePaymentDate(dto.date);
    this.receivePaymentValidationService.validateCreateDate(paymentDate, isAdmin);

    // Step 2: Resolve customer + location context before transactional work.
    const { locationId } = await this.customerValidationService.validateLocationAndCustomer(
      locationSlug,
      dto.customerId,
    );

    if (amountReceived < 0) {
      const result = await this.dataSource.transaction((manager) =>
        this.receivePaymentNegativeService.saveNegativeReceivePayment({
          manager,
          locationSlug,
          locationId,
          dto,
          currentUserId,
          paymentDate,
          amountReceived,
        }),
      );
      return result.response;
    }

    // Step 3: Prepare positive/zero receive-payment allocations.
    const invoiceDistributions = this.receivePaymentWorkBuilderService.normalizeDistributionItems(
      dto.invoicePayments,
    );
    const lessonDistributions = this.receivePaymentWorkBuilderService.normalizeDistributionItems(
      dto.lessonPayments,
    );
    const groupDistributions = this.receivePaymentWorkBuilderService.normalizeDistributionItems(
      dto.groupLessonPayments,
    );

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

    this.receivePaymentValidationService.validateRequestedDistributionTotals(
      amountReceived,
      invoiceDistributions,
      lessonDistributions,
      groupDistributions,
      invoiceCredits,
      paymentCredits,
    );

    const result = await this.dataSource.transaction(async (manager): Promise<ReceivePaymentSaveResult> => {
      const [walkin] = await manager.query('SELECT id FROM location_walkin_customer WHERE locationId=? AND customerId=? LIMIT 1', [locationId, dto.customerId]);
      if (walkin) {
        // Approved SMW-991 policy: this shared record represents different buyers.
        // A purchase cannot consume credit left by a previous walk-in buyer.
        assertWalkinPurchaseAllocation({ amount: amountReceived, invoices: invoiceDistributions,
          hasCredits: Boolean(invoiceCredits.length || paymentCredits.length),
          hasOtherCharges: Boolean(lessonDistributions.length || groupDistributions.length) });
      }
      // Step 4: Load all targets/sources that can receive allocations.
      const invoiceTargets = await this.receivePaymentRepository.findInvoiceTargetsForCustomer(
        uniqueIds(invoiceDistributions),
        dto.customerId,
        locationId,
        manager,
      );
      if (walkin && amountReceived > roundMoney(invoiceTargets.get(invoiceDistributions[0].id)?.balance || 0)) {
        throw new BadRequestException('Walk-in payment cannot exceed the selected invoice balance.');
      }

      const lessonTargets = await this.receivePaymentRepository.findPrivateLessonTargetsForCustomer(
        uniqueIds(lessonDistributions),
        dto.customerId,
        locationId,
        manager,
      );

      // Validate no canceled lessons (legacy parity: PaymentForm::validateLessonPayment)
      await this.receivePaymentValidationService.validateCanceledLessons(
        manager,
        uniqueIds(lessonDistributions),
      );

      const groupTargets = await this.receivePaymentRepository.findGroupLessonTargetsForCustomer(
        uniqueIds(groupDistributions),
        dto.customerId,
        locationId,
        manager,
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

      // Step 5: Convert raw lists into mutable work queues used by allocators.
      const invoiceWork = this.receivePaymentWorkBuilderService.buildInvoiceWork(
        invoiceDistributions,
        invoiceTargets,
      );
      const lessonWork = this.receivePaymentWorkBuilderService.buildLessonWork(
        lessonDistributions,
        lessonTargets,
      );
      const groupWork = this.receivePaymentWorkBuilderService.buildGroupWork(
        groupDistributions,
        groupTargets,
      );
      const invoiceCreditWork = this.receivePaymentWorkBuilderService.buildInvoiceCreditWork(
        invoiceCredits,
        invoiceCreditSources,
      );
      const paymentCreditWork = this.receivePaymentWorkBuilderService.buildPaymentCreditWork(
        paymentCredits,
        paymentCreditSources,
      );

      const affectedInvoiceIds = new Set<number>();
      const affectedPrivateLessonIds = new Set<number>();
      const affectedGroupLessonKeys = new Map<string, GroupLessonKey>();
      const affectedPaymentIds = new Set<number>();
      const royaltyCreditAllocations: RoyaltyCreditAllocation[] = [];
      const royaltyInvoiceCreditAllocations: RoyaltyInvoiceCreditAllocation[] = [];

      let appliedFromAmountReceived = 0;
      let appliedFromInvoiceCredits = 0;
      let appliedFromPaymentCredits = 0;

      // Step 6: Create the main payment only when cash amount is positive.
      let paymentId: number | null = null;
      if (amountReceived > 0) {
        const savedPayment = await this.receivePaymentPaymentFactoryService.createPaymentWithTransaction(
          manager,
          currentUserId,
          dto.customerId,
          dto.paymentMethodId!,
          amountReceived,
          amountReceived,
          paymentDate,
          dto.reference || '',
          dto.notes || '',
        );

        paymentId = savedPayment.id;
        affectedPaymentIds.add(paymentId);
      }

      // Step 7: Apply invoice credits first (legacy ordering).
      for (const credit of invoiceCreditWork) {
        while (credit.remainingCredit > 0) {
          let usedThisPass = false;

          usedThisPass =
            (await this.receivePaymentCreditApplierService.applyInvoiceCreditToInvoices(
              manager,
              credit,
              invoiceWork,
              dto.customerId,
              currentUserId,
              affectedInvoiceIds,
              affectedPaymentIds,
              royaltyInvoiceCreditAllocations,
            )) || usedThisPass;

          usedThisPass =
            (await this.receivePaymentCreditApplierService.applyInvoiceCreditToLessons(
              manager,
              credit,
              lessonWork,
              dto.customerId,
              currentUserId,
              affectedInvoiceIds,
              affectedPrivateLessonIds,
              affectedPaymentIds,
              royaltyInvoiceCreditAllocations,
            )) || usedThisPass;

          usedThisPass =
            (await this.receivePaymentCreditApplierService.applyInvoiceCreditToGroupLessons(
              manager,
              credit,
              groupWork,
              dto.customerId,
              currentUserId,
              affectedInvoiceIds,
              affectedGroupLessonKeys,
              affectedPaymentIds,
              royaltyInvoiceCreditAllocations,
            )) || usedThisPass;

          if (!usedThisPass) {
            break;
          }
        }
      }

      for (const credit of invoiceCreditWork) {
        const used = roundMoney(credit.requested - credit.remainingCredit);
        appliedFromInvoiceCredits += used;
      }

      // Step 8: Apply existing payment credits after invoice credits.
      for (const credit of paymentCreditWork) {
        while (credit.remainingCredit > 0) {
          let usedThisPass = false;

          usedThisPass =
            (await this.receivePaymentCreditApplierService.applyExistingPaymentCreditToInvoices(
              manager,
              credit,
              invoiceWork,
              currentUserId,
              affectedInvoiceIds,
              royaltyCreditAllocations,
            )) || usedThisPass;

          usedThisPass =
            (await this.receivePaymentCreditApplierService.applyExistingPaymentCreditToLessons(
              manager,
              credit,
              lessonWork,
              currentUserId,
              affectedPrivateLessonIds,
              royaltyCreditAllocations,
            )) || usedThisPass;

          usedThisPass =
            (await this.receivePaymentCreditApplierService.applyExistingPaymentCreditToGroupLessons(
              manager,
              credit,
              groupWork,
              currentUserId,
              affectedGroupLessonKeys,
              royaltyCreditAllocations,
            )) || usedThisPass;

          if (!usedThisPass) {
            break;
          }
        }

        affectedPaymentIds.add(credit.source.id);
      }

      for (const credit of paymentCreditWork) {
        const used = roundMoney(credit.requested - credit.remainingCredit);
        appliedFromPaymentCredits += used;
      }

      // Step 9: Apply received amount in invoice -> private lesson -> group lesson order.
      let amountRemaining = amountReceived;
      if (paymentId && amountRemaining > 0) {
        amountRemaining = await this.receivePaymentCashApplierService.applyCashToInvoiceTargets(
          manager,
          paymentId,
          amountRemaining,
          invoiceWork,
          currentUserId,
          affectedInvoiceIds,
        );

        amountRemaining = await this.receivePaymentCashApplierService.applyCashToLessonTargets(
          manager,
          paymentId,
          amountRemaining,
          lessonWork,
          currentUserId,
          affectedPrivateLessonIds,
        );

        amountRemaining = await this.receivePaymentCashApplierService.applyCashToGroupTargets(
          manager,
          paymentId,
          amountRemaining,
          groupWork,
          currentUserId,
          affectedGroupLessonKeys,
        );

        appliedFromAmountReceived = roundMoney(amountReceived - amountRemaining);
      }

      // Step 10: Recalculate all affected balances/statuses and persist customer balance.
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

      if (
        paymentId &&
        isRoyaltyEligiblePaymentMethod(Number(dto.paymentMethodId))
      ) {
        await this.paymentRoyaltyRecognitionService.recognizeReceivePayment(manager, {
          paymentId,
          paymentAmount: amountReceived,
          paymentBalance,
          locationId,
          customerId: dto.customerId,
          effectiveDate: paymentDate,
          unappliedRoyaltyPurposes: dto.unappliedRoyaltyPurposes,
          createdByUserId: currentUserId,
        });
      }

      for (const allocation of royaltyCreditAllocations) {
        await this.paymentRoyaltyAdjustmentService.processCreditAllocation(
          manager,
          {
            ...allocation,
            locationId,
            customerId: dto.customerId,
            effectiveDate: paymentDate,
            createdByUserId: currentUserId,
          },
        );
      }

      for (const allocation of royaltyInvoiceCreditAllocations) {
        await this.paymentRoyaltyAdjustmentService.processInvoiceCreditAllocation(
          manager,
          {
            ...allocation,
            locationId,
            customerId: dto.customerId,
            effectiveDate: paymentDate,
            createdByUserId: currentUserId,
          },
        );
      }

      return {
        response: {
          status: true,
          paymentId,
          paymentBalance: roundMoney(paymentBalance),
          amountReceived: roundMoney(amountReceived),
          applied: {
            fromAmountReceived: roundMoney(appliedFromAmountReceived),
            fromInvoiceCredits: roundMoney(appliedFromInvoiceCredits),
            fromPaymentCredits: roundMoney(appliedFromPaymentCredits),
            totalApplied: roundMoney(
              appliedFromAmountReceived + appliedFromInvoiceCredits + appliedFromPaymentCredits,
            ),
          },
        },
        auditContext: {
          locationSlug,
          locationId,
          customerId: dto.customerId,
          currentUserId,
          paymentDate,
          amountReceived,
          appliedFromAmountReceived,
          appliedFromInvoiceCredits,
          appliedFromPaymentCredits,
          affectedInvoiceIds: Array.from(affectedInvoiceIds),
          affectedPrivateLessonIds: Array.from(affectedPrivateLessonIds),
          affectedGroupLessonKeys: Array.from(affectedGroupLessonKeys.values()),
          affectedPaymentIds: Array.from(affectedPaymentIds),
          paymentCreditInvoiceId: null,
        },
      };
    });
    return result.response;
  }
}
