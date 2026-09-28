import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { InvoicePaymentDetailsRepository } from '../repositories/invoice-payment-details.repository';
import { InvoicePaymentsTransformationService } from './transformations/invoice-payments-transformation.service';
import { InvoicePaymentsResponse } from '../dto/invoice-payments-response.dto';
import { DeletePaymentResponseDto } from '../dto/delete-payment-response.dto';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';
import { getCurrentESTDate } from 'src/utils/date-utils';
import { RoyaltyTransactionRepository } from '../../payment/repositories/royalty-transaction.repository';
import { RoyaltyPaymentCorrectionService } from '../../payment/services/royalty-payment-correction.service';
import { assertPaymentIsNotLinkedToPaidPos } from '../../pos/utils/pos-payment-protection.util';

@Injectable()
export class InvoicePaymentDetailsService {
    constructor(
        private readonly invoicePaymentDetailsRepository: InvoicePaymentDetailsRepository,
        private readonly invoicePaymentsTransformationService: InvoicePaymentsTransformationService,
        private readonly dataSource: DataSource,
        private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
        private readonly royaltyTransactionRepository: RoyaltyTransactionRepository,
        private readonly royaltyPaymentCorrectionService: RoyaltyPaymentCorrectionService,
    ) { }

    /**
     * Get invoice payments (payment section on invoice detail page)
     * @param locationId - Location ID
     * @param locationSlug - Location slug
     * @param invoiceId - Invoice ID
     * @returns Object with body containing payments array
     */
    async getInvoicePayments(
        locationId: number,
        locationSlug: string,
        invoiceId: number,
    ): Promise<InvoicePaymentsResponse> {
        try {
            // Verify invoice exists and belongs to location
            const invoice = await this.invoicePaymentDetailsRepository.findInvoiceById(locationId, invoiceId);

            if (!invoice) {
                throw new NotFoundException(
                    `Invoice with ID ${invoiceId} not found in location ${locationSlug}`,
                );
            }

            // Fetch payments with payment and paymentMethod eager loaded
            const invoicePayments = await this.invoicePaymentDetailsRepository.findPaymentsByInvoiceId(invoiceId);

            // Transform using transformation service
            return this.invoicePaymentsTransformationService.transformToResponse(invoicePayments);
        } catch (error) {
            console.error('Error in getInvoicePayments service:', error);

            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }

            throw new BadRequestException(
                `Failed to retrieve invoice payments: ${error.message}`,
            );
        }
    }

    /**
     * Delete a payment and mirror the legacy soft-delete cascade.
     *
     * Purpose:
     *   - block invalid deletes before any mutation starts
     *   - soft-delete the payment plus linked invoice/lesson records in one transaction
     *   - recalculate payment, invoice, lesson, and customer balances after the cascade
     *   - refresh the location customer cache when the caller provides a slug
     */
    async deletePayment(
        paymentId: number,
        userId: number,
        locationSlug?: string,
        isAdmin= false,
    ): Promise<DeletePaymentResponseDto> {
        try {
            //step 1
            const payment = await this.invoicePaymentDetailsRepository.findPaymentById(paymentId);
            if (!payment) {
                throw new NotFoundException(`Payment with ID ${paymentId} not found`);
            }
            await assertPaymentIsNotLinkedToPaidPos(
                this.dataSource.manager,
                paymentId,
            );
            const hasRoyaltyRecognition =
                await this.royaltyTransactionRepository.hasPaymentRecognition(
                    this.dataSource.manager,
                    paymentId,
                );

            // TODO: Re-enable this restriction when the Head Office refund
            // approval workflow is ready. Use createdOn rather than the
            // payment date so a payment entered today but post-dated can still
            // be corrected on the day it was entered.
            // if (hasRoyaltyRecognition && !this.isSameESTDay(payment.createdOn)) {
            //     throw new BadRequestException(
            //         'Only royalty-recognized payments entered today can be deleted as corrections. Use the refund workflow for an earlier entry.',
            //     );
            // }

             // Owner and staff can delete current/future month payments, but only admins can delete past month payments.
            if (!isAdmin && !this.isCurrentOrFutureMonth(payment.date)) {
                throw new BadRequestException("You don't have access to delete past month payment receipts.");
            }

            //step 2 
            // V1: PFI check — "Used PFI's payments can't be deleted!"
            const hasLinkedPFI = await this.invoicePaymentDetailsRepository.hasLinkedPFI(paymentId);
            if (hasLinkedPFI) {
                throw new BadRequestException("Used PFI's payments can't be deleted!");
            }

            // V2: hasCreditUsed check — only for non-auto payments
            if (!this.invoicePaymentDetailsRepository.isAutoPayment(payment)) {
                const hasLessonCreditUsed = await this.invoicePaymentDetailsRepository.hasLessonWithCreditUsed(paymentId);
                if (hasLessonCreditUsed) {
                    throw new BadRequestException("Used lesson's payments can't be deleted!");
                }
            }

            // Wrap all mutating operations in a transaction
            await this.dataSource.transaction(async (manager) => {
                if (hasRoyaltyRecognition) {
                    await this.royaltyPaymentCorrectionService.reverseRecognizedPaymentForDeletion(
                        manager,
                        paymentId,
                        payment.date,
                        userId,
                    );
                }
                const cascadeResult = await this.invoicePaymentDetailsRepository.deletePaymentCascade(
                    paymentId,
                    userId,
                    manager,
                );

                for (const touchedPaymentId of cascadeResult.touchedPaymentIds) {
                    await this.invoicePaymentDetailsRepository.recalculatePaymentBalance(
                        touchedPaymentId,
                        userId,
                        manager,
                    );
                }

                for (const context of cascadeResult.affectedLessonContexts) {
                    await this.invoicePaymentDetailsRepository.recalculatePrivateLessonBalance(
                        context.lessonId,
                        context.enrolmentId,
                        userId,
                        manager,
                    );

                    if (context.enrolmentId !== null && context.enrolmentId !== undefined) {
                        await this.invoicePaymentDetailsRepository.recalculateGroupLessonBalance(
                            context.lessonId,
                            context.enrolmentId,
                            userId,
                            manager,
                        );
                    }
                }

                for (const invoiceId of cascadeResult.affectedInvoiceIds) {
                    const invoice = await this.invoicePaymentDetailsRepository.findInvoiceByIdOnly(
                        invoiceId,
                        manager,
                    );
                    if (invoice) {
                        await this.recalculateInvoice(invoiceId, invoice, userId, manager);
                    }
                }

                // Recompute the owning customer's balance from the final post-delete state.
                await this.customerBalanceRecalculatorService.recalculateAndPersist(payment.userId, {
                    manager,
                    updatedByUserId: userId,
                    locationSlug,
                });
            });

            return this.invoicePaymentsTransformationService.transformDeletePaymentResponse(paymentId);

        } catch (error) {
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }

            throw new BadRequestException(
                `Failed to delete payment: ${error.message}`,
            );
        }
    }


    private isCurrentOrFutureMonth(paymentDate: Date): boolean {
        const payment = new Date(paymentDate);
        if (Number.isNaN(payment.getTime())) {
            return false;
        }

        const current = getCurrentESTDate();
        const paymentMonthKey = payment.getUTCFullYear() * 12 + payment.getUTCMonth();
        const currentMonthKey = current.getUTCFullYear() * 12 + current.getUTCMonth();

        return paymentMonthKey >= currentMonthKey;
    }

    // Keep this helper with the commented royalty delete restriction above so
    // the approved same-day correction rule can be restored without rebuilding
    // its Eastern-time comparison.
    // private isSameESTDay(paymentDate: Date): boolean {
    //     const payment = new Date(paymentDate);
    //     if (Number.isNaN(payment.getTime())) {
    //         return false;
    //     }
    //     const current = getCurrentESTDate();
    //     return (
    //         payment.getUTCFullYear() === current.getUTCFullYear() &&
    //         payment.getUTCMonth() === current.getUTCMonth() &&
    //         payment.getUTCDate() === current.getUTCDate()
    //     );
    // }

    /**
     * Recalculate one invoice after payment rows change.
     * This keeps invoice subtotal, total, balance, and status aligned with the remaining allocations.
     */
    private async recalculateInvoice(
        invoiceId: number,
        invoice: any,
        userId: number,
        manager: EntityManager,
    ): Promise<void> {
        const paymentTotal = await this.invoicePaymentDetailsRepository.getPaymentTotal(invoiceId, manager);
        const appliedTotal = await this.invoicePaymentDetailsRepository.getAppliedPaymentTotal(invoiceId, manager);
        const creditUsedTotal = await this.invoicePaymentDetailsRepository.getCreditUsedTotal(invoiceId, manager);
        const netSubtotal = await this.invoicePaymentDetailsRepository.getLineItemSubtotal(invoiceId, manager);
        const lineItemTaxSum = await this.invoicePaymentDetailsRepository.getLineItemTaxSum(invoiceId, manager);

        const { subTotal, tax, total, balance, status } =
            this.invoicePaymentsTransformationService.calculateInvoiceTotals(
                invoice,
                netSubtotal,
                lineItemTaxSum,
                paymentTotal,
                appliedTotal,
                creditUsedTotal,
            );

        await this.invoicePaymentDetailsRepository.updateInvoiceTotals(
            invoice,
            subTotal,
            tax,
            total,
            balance,
            status,
            userId,
            manager,
        );
    }
}
