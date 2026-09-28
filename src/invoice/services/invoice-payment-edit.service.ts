import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { InvoicePaymentEditRepository } from '../repositories/invoice-payment-edit.repository';
import {
    InvoicePaymentDetailsRepository,
    LessonContext,
} from '../repositories/invoice-payment-details.repository';
import { InvoicePaymentEditTransformationService } from './transformations/invoice-payment-edit-transformation.service';
import { UpdateInvoicePaymentRequestDto, UpdateInvoicePaymentResponseDto } from '../dto/update-invoice-payment-request.dto';
import { PaymentMethodType } from '../../payment/enums/payment-method-type.enum';
import { InvoiceType } from '../enums/invoice-type.enum';
import { RoundingUtils } from '../../utils/rounding.utils';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';
import { RoyaltyTransactionRepository } from '../../payment/repositories/royalty-transaction.repository';
import { RoyaltyPaymentCorrectionService } from '../../payment/services/royalty-payment-correction.service';
import { assertPaymentIsNotLinkedToPaidPos } from '../../pos/utils/pos-payment-protection.util';

@Injectable()
export class InvoicePaymentEditService {
    constructor(
        private readonly invoicePaymentEditRepository: InvoicePaymentEditRepository,
        private readonly invoicePaymentDetailsRepository: InvoicePaymentDetailsRepository,
        private readonly transformationService: InvoicePaymentEditTransformationService,
        private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
        private readonly dataSource: DataSource,
        private readonly royaltyTransactionRepository: RoyaltyTransactionRepository,
        private readonly royaltyPaymentCorrectionService: RoyaltyPaymentCorrectionService,
    ) {}

    /**
     * Edit a payment from the invoice detail page's payment section.
     * Matches legacy PaymentController::actionUpdate($id) exactly.
     *
     * PHP Flow:
     *   1. Load payment, set scenario EDIT
     *   2. $payment->validate() → validateOnEdit() (block negative, auto, PFI, refunded)
     *   3. Load POST data into Payment + PaymentEditForm
     *   4. $payment->amount = $model->amount
     *   5. Date validation (non-admin can't change month)
     *   6. If amount > 0.00: $payment->save() + $model->save() (redistribute sub-payments)
     *   7. If amount <= 0.00: $payment->delete() (soft-delete + afterSoftDelete cascade)
     *   8. Return {status: true}
     */
    async updatePayment(
        paymentId: number,
        requestDto: UpdateInvoicePaymentRequestDto,
        userId: number,
        isAdmin: boolean,
    ): Promise<UpdateInvoicePaymentResponseDto> {
        try {
            return await this.dataSource.transaction(async (manager) => {
                // Step 0: Find payment directly by payment ID.
                // Matches legacy PaymentController::actionUpdate($id).
                const payment = await this.invoicePaymentEditRepository.findPaymentById(paymentId, manager);
                if (!payment) {
                    throw new NotFoundException(`Payment with ID ${paymentId} not found`);
                }
                await assertPaymentIsNotLinkedToPaidPos(manager, paymentId);
                const hasRoyaltyRecognition =
                    await this.royaltyTransactionRepository.hasPaymentRecognition(
                        manager,
                        paymentId,
                    );
                let royaltyEditContext:
                    | {
                        locationId: number;
                        customerId: number;
                        input: Parameters<
                            RoyaltyPaymentCorrectionService['reconcileRecognizedEdit']
                        >[1];
                        beforePurposes: Awaited<
                            ReturnType<
                                RoyaltyPaymentCorrectionService['captureAppliedPurposes']
                            >
                        >;
                    }
                    | undefined;
                if (hasRoyaltyRecognition) {
                    const scope =
                        await this.royaltyPaymentCorrectionService.getRecognitionScope(
                            manager,
                            paymentId,
                        );
                    const recognizedEditInput = {
                        paymentId,
                        locationId: scope.locationId,
                        customerId: scope.customerId,
                        oldAmount: Number(payment.amount),
                        newAmount: Number(requestDto.amount),
                        oldBalance: Number(payment.balance),
                        oldDate: payment.date,
                        newDate: requestDto.date,
                        oldPaymentMethodId: Number(payment.paymentMethodId),
                        newPaymentMethodId: Number(
                            requestDto.paymentMethodId ?? payment.paymentMethodId,
                        ),
                        createdByUserId: userId,
                    };
                    this.royaltyPaymentCorrectionService.validateRecognizedEditBeforeSave(
                        recognizedEditInput,
                    );
                    royaltyEditContext = {
                        ...scope,
                        input: recognizedEditInput,
                        beforePurposes:
                            await this.royaltyPaymentCorrectionService.captureAppliedPurposes(
                                manager,
                                paymentId,
                                scope.locationId,
                                Number(payment.balance),
                            ),
                    };
                }

                // Step 1: Validate request body now that the target payment exists.
                this.validateAmountDistribution(requestDto);

                // Step 2: Validate editability (matches: $payment->validate() → validateOnEdit)
                await this.validatePaymentEditable(payment, manager);

                // Step 3: Validate date change (matches: Carbon date comparison)
                this.validateDateChange(payment.date, requestDto.date, isAdmin);

                // Step 4: Format date (matches: (new \DateTime($payment->date))->format('Y-m-d H:i:s'))
                const formattedDate = this.formatPaymentDate(requestDto.date);

                const roundedAmount = RoundingUtils.roundHalfUp(requestDto.amount, 2);

                if (roundedAmount > 0.00) {
                    // Step 5a: amount > 0 → $payment->save() + $model->save()
                    await this.performUpdate(payment, requestDto, formattedDate, userId, manager);
                } else {
                    // Step 5b: amount <= 0 → $payment->delete() → afterSoftDelete cascade
                    await this.performSoftDelete(payment, userId, manager);
                }

                if (royaltyEditContext) {
                    await this.royaltyPaymentCorrectionService.reconcileRecognizedEdit(
                        manager,
                        royaltyEditContext.input,
                        royaltyEditContext.beforePurposes,
                        Number(payment.balance),
                    );
                }

                return this.transformationService.transformUpdateResponse();
            });
        } catch (error) {
            console.error('Error in updatePayment service:', error);

            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }

            throw new BadRequestException(
                `Failed to update payment: ${error.message}`,
            );
        }
    }

    /**
     * Validate that a payment can be edited.
     * Matches legacy Payment::validateOnEdit() exactly.
     *
     * Blocks if:
     * 1. Negative payment (non-credit-used, amount < 0)
     * 2. Auto-generated payment (account entry / credit used / credit applied)
     * 3. Linked to a PFI (pro-forma invoice)
     * 4. Linked to a payment credit invoice and payment is not negative
     */
    private async validatePaymentEditable(payment: any, manager: EntityManager): Promise<void> {
        // 1. Block negative payments (matches: $this->isNegativePayment())
        const paymentMethodId = Number(payment.paymentMethodId);
        const isCreditUsed = paymentMethodId === PaymentMethodType.CREDIT_USED;
        if (!isCreditUsed && Number(payment.amount) < 0) {
            throw new BadRequestException('Negative Payments Cannot be Edited');
        }

        // 2. Block auto-generated payments (matches: $this->isAutoPayments())
        const isAutoPayment =
            paymentMethodId === PaymentMethodType.CREDIT_APPLIED ||
            paymentMethodId === PaymentMethodType.CREDIT_USED ||
            paymentMethodId === PaymentMethodType.ACCOUNT_ENTRY;

        if (isAutoPayment) {
            throw new BadRequestException("System generated payments can't be deleted!");
        }

        // 3 & 4. Check invoice-related restrictions (matches: $this->hasInvoicePayments() loop)
        const invoicePayments = await this.invoicePaymentEditRepository.findInvoicePaymentsByPaymentId(
            payment.id,
            manager,
        );

        for (const ip of invoicePayments) {
            const invoice = ip.invoice;

            // Block if linked to PFI (matches: !$invoicePayment->invoice->isInvoice())
            if (invoice.type !== InvoiceType.INVOICE) {
                throw new BadRequestException("Used PFI's payments can't be modified!");
            }

            // Block if linked to a payment credit invoice (matches: isPaymentCreditInvoice() && !isNegativePayment())
            const isPaymentCredit = await this.invoicePaymentEditRepository.isPaymentCreditInvoice(
                invoice.id,
                manager,
            );
            if (isPaymentCredit && !(!isCreditUsed && Number(payment.amount) < 0)) {
                throw new BadRequestException('Refunded payments cannot be edited!');
            }
        }
    }

    /**
     * Validate that non-admin users cannot change the payment date to a different month.
     * Matches legacy: Carbon comparison of old month start/end vs new date
     */
    private validateDateChange(currentDate: Date, newDateStr: string, isAdmin: boolean): void {
        if (isAdmin) return;

        // Use UTC getters since TypeORM stores dates as UTC (timezone: 'Z')
        const oldYear = currentDate.getUTCFullYear();
        const oldMonth = currentDate.getUTCMonth(); // 0-indexed

        // Parse new date string directly from "YYYY-MM-DD" to avoid new Date() timezone shift
        const [newYear, newMonthOneBased] = newDateStr.substring(0, 7).split('-').map(Number);
        const newMonth = newMonthOneBased - 1; // Convert to 0-indexed to match getUTCMonth()

        if (oldYear !== newYear || oldMonth !== newMonth) {
            throw new BadRequestException('You cannot alter the payment date to another month');
        }
    }

    /**
     * Validate amount matches distribution totals.
     * Matches legacy PaymentEditForm::validateAmount()
     */
    private validateAmountDistribution(requestDto: UpdateInvoicePaymentRequestDto): void {
        const amount = RoundingUtils.roundHalfUp(requestDto.amount, 2);
        const amountToDistribute = RoundingUtils.roundHalfUp(requestDto.amountToDistribute, 2);

        if (amountToDistribute > amount) {
            throw new BadRequestException('Amount mismatched with distributions');
        }
    }

    /**
     * Perform the payment update when amount > 0.
     * Matches legacy: $payment->save() + $model->save()
     *
     * 1. $payment->save() → updates payment table (amount, date, payment_method_id, reference)
     * 2. $model->save() → redistributes lesson_payment and invoice_payment rows
     * 3. Recalculate payment balance after redistribution
     * 4. Re-save linked invoices (recalculate invoice balance/status)
     * 5. Update customer balance
     */
    private async performUpdate(
        payment: any,
        requestDto: UpdateInvoicePaymentRequestDto,
        formattedDate: string,
        userId: number,
        manager: EntityManager,
    ): Promise<void> {
        const affectedTargets = await this.captureAffectedAccountingTargets(payment.id, manager);

        // Step 1: $payment->save() — save payment fields
        // First calculate balance before redistribution
        const balance = await this.invoicePaymentEditRepository.calculatePaymentBalance(
            payment.id,
            requestDto.amount,
            manager,
        );

        await this.invoicePaymentEditRepository.updatePayment(payment, {
            amount: requestDto.amount,
            date: formattedDate,
            paymentMethodId: requestDto.paymentMethodId,
            reference: requestDto.reference,
            balance: balance,
            updatedByUserId: userId,
        }, manager);

        // Step 2: $model->save() — redistribute sub-payments
        await this.redistributeSubPayments(payment.id, requestDto, userId, manager);

        // Step 3: Recalculate payment balance after redistribution
        const finalBalance = await this.invoicePaymentEditRepository.calculatePaymentBalance(
            payment.id,
            requestDto.amount,
            manager,
        );
        await this.invoicePaymentEditRepository.updatePayment(payment, {
            amount: requestDto.amount,
            date: formattedDate,
            paymentMethodId: requestDto.paymentMethodId,
            reference: requestDto.reference,
            balance: finalBalance,
            updatedByUserId: userId,
        }, manager);

        // Step 4: Recalculate all affected invoice balances
        await this.recalculateLinkedInvoices(affectedTargets.invoiceIds, userId, manager);

        // Step 5: Recalculate affected private/group lesson balances
        await this.recalculateLinkedLessonBalances(affectedTargets.lessonContexts, userId, manager);

        // Step 6: Update customer balance
        await this.customerBalanceRecalculatorService.recalculateAndPersist(payment.userId, {
            updatedByUserId: userId,
            manager,
        });
    }

    private isZeroAllocation(value: number | null | undefined): boolean {
        return RoundingUtils.roundHalfUp(Number(value ?? 0), 2) <= 0;
    }

    /**
     * Redistribute sub-payments to lessons, group lessons, and invoices.
     * Matches legacy PaymentEditForm::save() exactly.
     *
     * For each item in the array:
     *   - Find all existing records for that lesson/invoice + this paymentId
     *   - First record (index 0): update amount or delete if value = 0
     *   - Subsequent records (index > 0): delete (deduplication)
     *
     * Some receipt payloads omit $0 allocation rows. Amount To Apply $0.00 can
     * therefore arrive without lessonPayments and leave the old $0.01 row on
     * the lesson. Unapply any existing row that is no longer retained.
     */
    private async redistributeSubPayments(
        paymentId: number,
        requestDto: UpdateInvoicePaymentRequestDto,
        userId: number,
        manager: EntityManager,
    ): Promise<void> {
        const amountToDistribute = RoundingUtils.roundHalfUp(
            Number(requestDto.amountToDistribute ?? 0),
            2,
        );
        const hasPositiveSubmittedAllocations = [
            ...(requestDto.lessonPayments ?? []),
            ...(requestDto.groupLessonPayments ?? []),
            ...(requestDto.invoicePayments ?? []),
        ].some((item) => !this.isZeroAllocation(item.value));

        // Amount To Apply $0.00 means move the payment to credit. Do not do
        // this when the payload still has a positive allocation line.
        if (amountToDistribute <= 0 && !hasPositiveSubmittedAllocations) {
            await this.invoicePaymentEditRepository.softDeleteLessonPayments(
                paymentId,
                userId,
                manager,
            );
            await this.invoicePaymentEditRepository.softDeleteInvoicePayments(
                paymentId,
                userId,
                manager,
            );
            return;
        }

        const keptLessonPaymentIds = new Set<number>();
        const keptInvoicePaymentIds = new Set<number>();

        // Process lesson payments (matches: foreach $this->lessonPayments)
        if (requestDto.lessonPayments && requestDto.lessonPayments.length > 0) {
            for (const lp of requestDto.lessonPayments) {
                const roundedValue = RoundingUtils.roundHalfUp(Number(lp.value ?? 0), 2);
                const payments = await this.invoicePaymentEditRepository.findLessonPaymentsByLessonAndPayment(
                    lp.id,
                    paymentId,
                    undefined,
                    manager,
                );
                for (let i = 0; i < payments.length; i++) {
                    if (i === 0) {
                        if (this.isZeroAllocation(roundedValue)) {
                            await this.invoicePaymentEditRepository.softDeleteLessonPaymentById(
                                payments[i].id,
                                userId,
                                manager,
                            );
                        } else {
                            keptLessonPaymentIds.add(Number(payments[i].id));
                            await this.invoicePaymentEditRepository.updateLessonPaymentAmount(
                                payments[i].id,
                                roundedValue,
                                userId,
                                manager,
                            );
                        }
                    } else {
                        // Delete duplicates
                        await this.invoicePaymentEditRepository.softDeleteLessonPaymentById(
                            payments[i].id,
                            userId,
                            manager,
                        );
                    }
                }
            }
        }

        // Process group lesson payments (matches: foreach $this->groupLessonPayments)
        // In PHP: $groupLesson = GroupLesson::findOne($groupLessonPayment['id'])
        //         $groupLesson->lesson->getPaymentsById($this->paymentId, $groupLesson->enrolment->id)
        // glp.id is a GroupLesson ID — must look up to get lessonId and enrolmentId
        if (requestDto.groupLessonPayments && requestDto.groupLessonPayments.length > 0) {
            for (const glp of requestDto.groupLessonPayments) {
                // Look up the GroupLesson to get its lessonId and enrolmentId
                const groupLesson = await this.invoicePaymentEditRepository.findGroupLessonById(glp.id, manager);
                if (!groupLesson) {
                    // Fail closed: otherwise snapshot cleanup would remove valid
                    // allocations when a stale client submits lesson.id.
                    throw new BadRequestException(
                        `Group lesson with ID ${glp.id} not found`,
                    );
                }

                const payments = await this.invoicePaymentEditRepository.findLessonPaymentsByLessonAndPayment(
                    groupLesson.lessonId,
                    paymentId,
                    groupLesson.enrolmentId,
                    manager,
                );
                const roundedValue = RoundingUtils.roundHalfUp(Number(glp.value ?? 0), 2);
                for (let i = 0; i < payments.length; i++) {
                    if (i === 0) {
                        if (this.isZeroAllocation(roundedValue)) {
                            await this.invoicePaymentEditRepository.softDeleteLessonPaymentById(
                                payments[i].id,
                                userId,
                                manager,
                            );
                        } else {
                            keptLessonPaymentIds.add(Number(payments[i].id));
                            await this.invoicePaymentEditRepository.updateLessonPaymentAmount(
                                payments[i].id,
                                roundedValue,
                                userId,
                                manager,
                            );
                        }
                    } else {
                        await this.invoicePaymentEditRepository.softDeleteLessonPaymentById(
                            payments[i].id,
                            userId,
                            manager,
                        );
                    }
                }
            }
        }

        // Process invoice payments (matches: foreach $this->invoicePayments)
        if (requestDto.invoicePayments && requestDto.invoicePayments.length > 0) {
            for (const ip of requestDto.invoicePayments) {
                const payments = await this.invoicePaymentEditRepository.findInvoicePaymentsByInvoiceAndPayment(
                    ip.id,
                    paymentId,
                    manager,
                );
                const roundedValue = RoundingUtils.roundHalfUp(Number(ip.value ?? 0), 2);
                for (let i = 0; i < payments.length; i++) {
                    if (i === 0) {
                        if (this.isZeroAllocation(roundedValue)) {
                            await this.invoicePaymentEditRepository.softDeleteInvoicePaymentById(
                                payments[i].id,
                                userId,
                                manager,
                            );
                        } else {
                            keptInvoicePaymentIds.add(Number(payments[i].id));
                            await this.invoicePaymentEditRepository.updateInvoicePaymentAmount(
                                payments[i].id,
                                roundedValue,
                                userId,
                                manager,
                            );
                        }
                    } else {
                        await this.invoicePaymentEditRepository.softDeleteInvoicePaymentById(
                            payments[i].id,
                            userId,
                            manager,
                        );
                    }
                }
            }
        }

        // The v2 receipt client submits both lesson lists as a complete snapshot.
        // Exact row IDs are required because group enrolments can share a lesson ID.
        const submittedAllLessonAllocations =
            requestDto.lessonPayments !== undefined &&
            requestDto.groupLessonPayments !== undefined;
        if (submittedAllLessonAllocations) {
            const existingLessonPayments =
                await this.invoicePaymentEditRepository.findLessonPaymentsByPaymentId(
                    paymentId,
                    manager,
                );
            for (const existing of existingLessonPayments) {
                if (!keptLessonPaymentIds.has(Number(existing.id))) {
                    await this.invoicePaymentEditRepository.softDeleteLessonPaymentById(
                        existing.id,
                        userId,
                        manager,
                    );
                }
            }
        }

        if (requestDto.invoicePayments !== undefined) {
            const existingInvoicePayments =
                await this.invoicePaymentEditRepository.findInvoicePaymentsByPaymentId(
                    paymentId,
                    manager,
                );
            for (const existing of existingInvoicePayments) {
                if (!keptInvoicePaymentIds.has(Number(existing.id))) {
                    await this.invoicePaymentEditRepository.softDeleteInvoicePaymentById(
                        existing.id,
                        userId,
                        manager,
                    );
                }
            }
        }
    }

    /**
     * Soft-delete payment and cascade to related records.
     * Matches legacy Payment::afterSoftDelete() exactly.
     *
     * 1. Handle auto-payment cascade (credit applied/used)
     * 2. Soft-delete all linked invoice_payment records
     * 3. Soft-delete all linked lesson_payment records
     * 4. Soft-delete the payment itself
     * 5. Recalculate linked invoice balances
     * 6. Update customer balance
     */
    private async performSoftDelete(payment: any, userId: number, manager: EntityManager): Promise<void> {
        const affectedTargets = await this.captureAffectedAccountingTargets(payment.id, manager);

        // Handle auto-payment cascade (credit applied/used)
        const isAutoPayment =
            payment.paymentMethodId === PaymentMethodType.CREDIT_APPLIED ||
            payment.paymentMethodId === PaymentMethodType.CREDIT_USED ||
            payment.paymentMethodId === PaymentMethodType.ACCOUNT_ENTRY;

        if (isAutoPayment) {
            if (payment.paymentMethodId === PaymentMethodType.CREDIT_APPLIED) {
                // Delete the paired debit-usage payment
                const creditUsage = await this.invoicePaymentEditRepository.findCreditUsageByCreditPaymentId(
                    payment.id,
                    manager,
                );
                if (creditUsage) {
                    const debitPayment = await this.invoicePaymentEditRepository.findPaymentById(
                        creditUsage.debitPaymentId,
                        manager,
                    );
                    if (debitPayment && !debitPayment.isDeleted) {
                        await this.invoicePaymentEditRepository.softDeletePayment(
                            debitPayment.id,
                            userId,
                            manager,
                        );
                    }
                }
            } else {
                // Delete the paired credit-usage payment
                const debitUsage = await this.invoicePaymentEditRepository.findCreditUsageByDebitPaymentId(
                    payment.id,
                    manager,
                );
                if (debitUsage) {
                    const creditPayment = await this.invoicePaymentEditRepository.findPaymentById(
                        debitUsage.creditPaymentId,
                        manager,
                    );
                    if (creditPayment && !creditPayment.isDeleted) {
                        await this.invoicePaymentEditRepository.softDeletePayment(
                            creditPayment.id,
                            userId,
                            manager,
                        );
                    }
                }
            }
        }

        // Soft-delete all linked invoice_payment records
        await this.invoicePaymentEditRepository.softDeleteInvoicePayments(payment.id, userId, manager);

        // Soft-delete all linked lesson_payment records
        await this.invoicePaymentEditRepository.softDeleteLessonPayments(payment.id, userId, manager);

        // Soft-delete the payment itself
        await this.invoicePaymentEditRepository.softDeletePayment(payment.id, userId, manager);

        // Recalculate all affected invoice balances (matches: $this->invoice->save())
        await this.recalculateLinkedInvoices(affectedTargets.invoiceIds, userId, manager);

        // Recalculate affected private/group lesson balances
        await this.recalculateLinkedLessonBalances(affectedTargets.lessonContexts, userId, manager);

        // Update customer balance (matches: $this->customer->updateCustomerBalance())
        await this.customerBalanceRecalculatorService.recalculateAndPersist(payment.userId, {
            updatedByUserId: userId,
            manager,
        });
    }

    /**
     * Collect invoice and lesson targets before any mutation so we can refresh
     * the affected parent balances after the payment rows are changed.
     */
    private async captureAffectedAccountingTargets(
        paymentId: number,
        manager: EntityManager,
    ): Promise<{
        invoiceIds: number[];
        lessonContexts: LessonContext[];
    }> {
        const [invoicePayments, lessonPayments] = await Promise.all([
            this.invoicePaymentEditRepository.findInvoicePaymentsByPaymentId(paymentId, manager),
            this.invoicePaymentEditRepository.findLessonPaymentsByPaymentId(paymentId, manager),
        ]);

        const invoiceIds = Array.from(
            new Set(
                invoicePayments
                    .map((invoicePayment) => Number(invoicePayment.invoiceId))
                    .filter((invoiceId) => Number.isFinite(invoiceId) && invoiceId > 0),
            ),
        );

        const lessonContextMap = new Map<string, LessonContext>();
        for (const lessonPayment of lessonPayments) {
            const lessonId = Number(lessonPayment.lessonId);
            if (!Number.isFinite(lessonId) || lessonId <= 0) {
                continue;
            }

            const enrolmentId =
                lessonPayment.enrolmentId === null || lessonPayment.enrolmentId === undefined
                    ? null
                    : Number(lessonPayment.enrolmentId);

            const key = `${lessonId}:${enrolmentId ?? 'null'}`;
            if (!lessonContextMap.has(key)) {
                lessonContextMap.set(key, { lessonId, enrolmentId });
            }
        }

        return {
            invoiceIds,
            lessonContexts: Array.from(lessonContextMap.values()),
        };
    }

    /**
     * Recalculate balances for all affected invoices.
     * Matches legacy: re-saving the invoice triggers beforeSave balance calculation
     */
    private async recalculateLinkedInvoices(
        invoiceIds: number[],
        userId: number,
        manager: EntityManager,
    ): Promise<void> {
        for (const invoiceId of invoiceIds) {
            await this.invoicePaymentEditRepository.recalculateInvoiceBalance(invoiceId, userId, manager);
        }
    }

    /**
     * Recalculate private and group lesson balances for all affected lesson
     * contexts after payment allocations change.
     */
    private async recalculateLinkedLessonBalances(
        lessonContexts: LessonContext[],
        userId: number,
        manager: EntityManager,
    ): Promise<void> {
        for (const lessonContext of lessonContexts) {
            await this.invoicePaymentDetailsRepository.recalculatePrivateLessonBalance(
                lessonContext.lessonId,
                lessonContext.enrolmentId,
                userId,
                manager,
            );

            if (lessonContext.enrolmentId !== null && lessonContext.enrolmentId !== undefined) {
                await this.invoicePaymentDetailsRepository.recalculateGroupLessonBalance(
                    lessonContext.lessonId,
                    lessonContext.enrolmentId,
                    userId,
                    manager,
                );
            }
        }
    }

    /**
     * Format date string to YYYY-MM-DD HH:mm:ss
     * Matches legacy: (new \DateTime($payment->date))->format('Y-m-d H:i:s')
     * Avoids new Date() to prevent timezone shift on YYYY-MM-DD input strings.
     */
    private formatPaymentDate(dateStr: string): string {
        // Extract date part (handles both "YYYY-MM-DD" and "YYYY-MM-DDTHH:mm:ss" formats)
        const datePart = dateStr.substring(0, 10);
        const timePart = dateStr.length > 10
            ? dateStr.replace('T', ' ').substring(11, 19)
            : '00:00:00';
        return `${datePart} ${timePart}`;
    }
}
