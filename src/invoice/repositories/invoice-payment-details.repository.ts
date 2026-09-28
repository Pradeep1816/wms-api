import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { InvoicePayment } from '../entities/invoice-payment.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { LessonPayment } from '../../lesson/entities/lesson-payment.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { PaymentMethodType } from '../../payment/enums/payment-method-type.enum';
import { PrivateLesson } from '../../lesson/entities/private-lesson.entity';
import { CustomerAccount } from '../../customer/entities/customer-account.entity';
import { CreditUsage } from '../../payment/entities/credit-usage.entity';
import { ItemTypeEnum } from '../enums/item-type.enum';
import { GroupLesson } from '../../lesson/entities/group-lesson.entity';
import { RoundingUtils } from '../../utils/rounding.utils';

/**
 * Payment method IDs that represent auto-generated payments.
 * Mirrors legacy Payment::isAutoPayments()
 */
const AUTO_PAYMENT_METHODS = [
    PaymentMethodType.ACCOUNT_ENTRY,
    PaymentMethodType.CREDIT_USED,
    PaymentMethodType.CREDIT_APPLIED,
];

export type LessonContext = {
    lessonId: number;
    enrolmentId: number | null;
};

export interface PaymentDeleteCascadeResult {
    touchedPaymentIds: number[];
    affectedInvoiceIds: number[];
    affectedLessonContexts: LessonContext[];
}


@Injectable()
export class InvoicePaymentDetailsRepository {
    constructor(
        @InjectRepository(Invoice)
        private readonly invoiceRepository: Repository<Invoice>,
        @InjectRepository(InvoicePayment)
        private readonly invoicePaymentRepository: Repository<InvoicePayment>,
        @InjectRepository(Payment)
        private readonly paymentRepository: Repository<Payment>,
        @InjectRepository(LessonPayment)
        private readonly lessonPaymentRepository: Repository<LessonPayment>,
    ) { }

    /**
     * Find a single invoice by ID and locationId so delete logic can verify the
     * invoice belongs to the current location before it reads linked payments.
     */
    async findInvoiceById(
        locationId: number,
        invoiceId: number,
    ): Promise<Invoice | null> {
        return this.invoiceRepository
            .createQueryBuilder('invoice')
            .where('invoice.id = :invoiceId', { invoiceId })
            .andWhere('invoice.locationId = :locationId', { locationId })
            .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
            .getOne();
    }

    /**
     * Fetch active invoice payments so invoice detail and delete recalculation
     * can work from the current linked payment rows.
     */
    async findPaymentsByInvoiceId(invoiceId: number): Promise<InvoicePayment[]> {
        return this.invoicePaymentRepository
            .createQueryBuilder('invoicePayment')
            .innerJoinAndSelect('invoicePayment.payment', 'payment')
            .innerJoinAndSelect('payment.paymentMethod', 'paymentMethod')
            .where('invoicePayment.invoiceId = :invoiceId', { invoiceId })
            .andWhere('invoicePayment.isDeleted = :isDeleted', { isDeleted: 0 })
            .andWhere('payment.isDeleted = :paymentDeleted', { paymentDeleted: 0 })
            .orderBy('payment.date', 'DESC')
            .getMany();
    }

    // ─── DELETE PAYMENT: FIND 

    /**
     * Load the active payment row so delete validation can inspect its method,
     * amount, and current delete state.
     */
    async findPaymentById(paymentId: number): Promise<Payment | null> {
        return this.paymentRepository
            .createQueryBuilder('payment')
            .leftJoinAndSelect('payment.paymentMethod', 'paymentMethod')
            .where('payment.id = :paymentId', { paymentId })
            .andWhere('payment.isDeleted = :isDeleted', { isDeleted: 0 })
            .getOne();
    }

    /**
     * Load active invoice-payment rows for a payment so delete can soft-delete
     * the allocation rows and recalculate invoice totals.
     */
    async findInvoicePaymentsByPaymentId(paymentId: number): Promise<InvoicePayment[]> {
        return this.invoicePaymentRepository
            .createQueryBuilder('ip')
            .innerJoinAndSelect('ip.invoice', 'invoice')
            .where('ip.paymentId = :paymentId', { paymentId })
            .andWhere('ip.isDeleted = :isDeleted', { isDeleted: 0 })
            .getMany();
    }

    /**
     * Load active lesson-payment rows for a payment so delete can update lesson
     * balances and follow lesson-credit chains.
     */
    async findLessonPaymentsByPaymentId(paymentId: number): Promise<LessonPayment[]> {
        return this.lessonPaymentRepository
            .createQueryBuilder('lp')
            .leftJoinAndSelect('lp.lesson', 'lesson')
            .leftJoinAndSelect('lp.payment', 'payment')
            .where('lp.paymentId = :paymentId', { paymentId })
            .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
            .getMany();
    }

    /**
     * Block delete when the payment is tied to a non-invoice PFI record.
     */
    async hasLinkedPFI(paymentId: number): Promise<boolean> {
        const count = await this.invoicePaymentRepository
            .createQueryBuilder('ip')
            .innerJoin('ip.invoice', 'invoice')
            .where('ip.paymentId = :paymentId', { paymentId })
            .andWhere('ip.isDeleted = :isDeleted', { isDeleted: 0 })
            .andWhere('invoice.type != :invoiceType', { invoiceType: Invoice.TYPE_INVOICE })
            .getCount();

        return count > 0;
    }

    /**
     * Block delete when the same lesson/enrolment already has a live CREDIT_USED
     * payment.
     */
    async hasLessonWithCreditUsed(paymentId: number): Promise<boolean> {
        const lessonPayments = await this.lessonPaymentRepository
            .createQueryBuilder('lp')
            .innerJoinAndSelect('lp.lesson', 'lesson')
            .where('lp.paymentId = :paymentId', { paymentId })
            .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
            .getMany();

        for (const lp of lessonPayments) {
            const creditUsedQuery = this.lessonPaymentRepository
                .createQueryBuilder('lp2')
                .innerJoin('lp2.payment', 'p')
                .where('lp2.lessonId = :lessonId', { lessonId: lp.lessonId })
                .andWhere('lp2.isDeleted = :isDeleted', { isDeleted: 0 })
                .andWhere('p.isDeleted = :pDeleted', { pDeleted: 0 })
                .andWhere('p.paymentMethodId = :creditUsed', { creditUsed: PaymentMethodType.CREDIT_USED });

            if (lp.enrolmentId === null || lp.enrolmentId === undefined) {
                creditUsedQuery.andWhere('lp2.enrolmentId IS NULL');
            } else {
                creditUsedQuery.andWhere('lp2.enrolmentId = :enrolmentId', { enrolmentId: lp.enrolmentId });
            }

            const creditUsedCount = await creditUsedQuery.getCount();

            if (creditUsedCount > 0) {
                return true;
            }
        }
        return false;
    }
    /**
     * Identify auto-generated payments so the delete cascade can recurse through
     * paired credit flows.
     */
    isAutoPayment(payment: Payment): boolean {
        return AUTO_PAYMENT_METHODS.includes(payment.paymentMethodId);
    }
    /**
     * Soft-delete the main payment row while preserving the record for audit and
     * legacy-style behavior.
     */
    async softDeletePayment(payment: Payment): Promise<Payment> {
        payment.isDeleted = 1;
        return this.paymentRepository.save(payment);
    }

    /**
     * Soft-delete one invoice-payment allocation row.
     */
    async softDeleteInvoicePayment(ip: InvoicePayment): Promise<InvoicePayment> {
        ip.isDeleted = 1;
        return this.invoicePaymentRepository.save(ip);
    }

    /**
     * Soft-delete one lesson-payment allocation row.
     */
    async softDeleteLessonPayment(lp: LessonPayment): Promise<LessonPayment> {
        lp.isDeleted = 1;
        return this.lessonPaymentRepository.save(lp);
    }

    /**
     * Delete the paired payment for auto-payment credit flows and continue the
     * lesson-credit cascade where required.
     */
    async deleteAutoPaymentPair(payment: Payment): Promise<void> {
        const creditUsageRepo = this.invoiceRepository.manager.getRepository(CreditUsage);

        if (payment.paymentMethodId === PaymentMethodType.CREDIT_APPLIED) {
            const creditUsage = await creditUsageRepo.findOne({
                where: { creditPaymentId: payment.id },
            });
            if (creditUsage) {
                const debitPayment = await this.findPaymentById(creditUsage.debitPaymentId);
                if (debitPayment && !debitPayment.isDeleted) {
                    await this.softDeletePayment(debitPayment);
                    await this.softDeleteInvoicePaymentsForPayment(debitPayment.id);
                    await this.softDeleteLessonPaymentsForPayment(debitPayment.id);
                }
            }
            await this.deleteLessonCreditCascade(payment.id);
        } else {
            const creditUsage = await creditUsageRepo.findOne({
                where: { debitPaymentId: payment.id },
            });
            if (creditUsage) {
                const creditPayment = await this.findPaymentById(creditUsage.creditPaymentId);
                if (creditPayment && !creditPayment.isDeleted) {
                    await this.softDeletePayment(creditPayment);
                    await this.softDeleteInvoicePaymentsForPayment(creditPayment.id);
                    await this.softDeleteLessonPaymentsForPayment(creditPayment.id);
                }
            }
        }
    }

    /**
     * Bulk soft-delete all invoice-payment rows linked to a payment.
     */
    private async softDeleteInvoicePaymentsForPayment(paymentId: number): Promise<void> {
        // Bulk update instead of individual saves for better performance
        await this.invoicePaymentRepository
            .createQueryBuilder()
            .update(InvoicePayment)
            .set({ isDeleted: 1 })
            .where('paymentId = :paymentId', { paymentId })
            .andWhere('isDeleted = :isDeleted', { isDeleted: 0 })
            .execute();
    }
    /**
     * Bulk soft-delete all lesson-payment rows linked to a payment.
     */
    private async softDeleteLessonPaymentsForPayment(paymentId: number): Promise<void> {
        // Bulk update instead of individual saves for better performance
        await this.lessonPaymentRepository
            .createQueryBuilder()
            .update(LessonPayment)
            .set({ isDeleted: 1 })
            .where('paymentId = :paymentId', { paymentId })
            .andWhere('isDeleted = :isDeleted', { isDeleted: 0 })
            .execute();
    }
    /**
     * Re-apply the legacy payment-credit invoice cascade after one invoice
     * payment row has been soft-deleted.
     */
    async cascadeInvoicePaymentAfterSoftDelete(
        invoiceId: number,
        originalPayment: Payment,
    ): Promise<void> {
        const isPaymentCreditInvoice = await this.isPaymentCreditInvoice(invoiceId);
        if (!isPaymentCreditInvoice) return;
        const remainingIps = await this.invoicePaymentRepository
            .createQueryBuilder('ip')
            .innerJoinAndSelect('ip.payment', 'payment')
            .where('ip.invoiceId = :invoiceId', { invoiceId })
            .andWhere('ip.isDeleted = :isDeleted', { isDeleted: 0 })
            .getMany();

        for (const ip of remainingIps) {
            await this.softDeleteInvoicePayment(ip);
            const isNegativePayment = originalPayment.paymentMethodId !== PaymentMethodType.CREDIT_USED
                && Number(originalPayment.amount) < 0;

            if (!isNegativePayment && ip.payment && !ip.payment.isDeleted) {
                await this.softDeletePayment(ip.payment);
            }
        }
    }

    /**
     * Detect whether an invoice is a payment-credit invoice so recursive delete
     * can continue through its remaining payments.
     */
    async isPaymentCreditInvoice(
        invoiceId: number,
        manager: EntityManager = this.invoiceRepository.manager,
    ): Promise<boolean> {
        const lineItem = await manager
            .createQueryBuilder()
            .select('ili.item_type_id', 'itemTypeId')
            .from('invoice_line_item', 'ili')
            .where('ili.invoice_id = :invoiceId', { invoiceId })
            .andWhere('ili.isDeleted = 0')
            .orderBy('ili.id', 'ASC')
            .limit(1)
            .getRawOne();

        return lineItem ? Number(lineItem.itemTypeId) === ItemTypeEnum.TYPE_PAYMENT_CREDIT : false;
    }

    /**
     * Re-run the lesson-side delete cascade and balance recalculation after a
     * lesson-payment row is soft-deleted.
     */
    async cascadeLessonPaymentAfterSoftDelete(
        lessonPayment: LessonPayment,
    ): Promise<void> {
        const payment = await this.findPaymentById(lessonPayment.paymentId);
        if (payment && this.isAutoPayment(payment) && !payment.isDeleted) {
            await this.softDeletePayment(payment);
            await this.softDeleteInvoicePaymentsForPayment(payment.id);
            await this.softDeleteLessonPaymentsForPayment(payment.id);
        }

        // Mirrors PHP: $this->payment->save() which triggers Payment::beforeSave() → recalculates balance
        await this.recalculatePaymentBalance(lessonPayment.paymentId);

        if (lessonPayment.lessonId) {
            await this.recalculatePrivateLessonBalance(
                lessonPayment.lessonId,
                lessonPayment.enrolmentId ?? null,
            );
        }

        if (lessonPayment.lessonId && lessonPayment.enrolmentId) {
            await this.recalculateGroupLessonBalance(lessonPayment.lessonId, lessonPayment.enrolmentId);
        }
    }

    /**
     * Recompute a payment balance from the surviving invoice and lesson
     * allocations after delete.
     */
    async recalculatePaymentBalance(
        paymentId: number,
        userId?: number,
        manager: EntityManager = this.paymentRepository.manager,
    ): Promise<void> {
        const payment = await manager.getRepository(Payment).findOne({ where: { id: paymentId } });
        if (!payment) return;

        const ipResult = await manager
            .createQueryBuilder()
            .from('invoice_payment', 'ip')
            .select('COALESCE(SUM(ip.amount), 0)', 'total')
            .where('ip.payment_id = :paymentId', { paymentId })
            .andWhere('ip.isDeleted = :isDeleted', { isDeleted: 0 })
            .getRawOne<{ total: string | number }>();
        const lpResult = await manager
            .createQueryBuilder()
            .from('lesson_payment', 'lp')
            .select('COALESCE(SUM(lp.amount), 0)', 'total')
            .where('lp.paymentId = :paymentId', { paymentId })
            .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
            .getRawOne<{ total: string | number }>();
        payment.balance = RoundingUtils.calculatePaymentBalance(
            payment.amount,
            ipResult?.total || 0,
            lpResult?.total || 0,
        );
        if (userId !== undefined) {
            payment.updatedByUserId = userId;
        }
        await manager.getRepository(Payment).save(payment);
    }
    /**
     * Recompute private lesson balance after delete using the active lesson
     * credit applied amount.
     */
    async recalculatePrivateLessonBalance(
        lessonId: number,
        enrolmentId: number | null,
        userId?: number,
        manager: EntityManager = this.invoiceRepository.manager,
    ): Promise<void> {
        if (enrolmentId === null || enrolmentId === undefined) {
            return;
        }

        const privateLessonRepo = manager.getRepository(PrivateLesson);
        const privateLesson = await privateLessonRepo.findOne({
            where: { lessonId },
        });
        if (!privateLesson) return;

        const creditAppliedAmount = await this.getLessonCreditAppliedAmount(
            lessonId,
            enrolmentId,
            manager,
        );

        privateLesson.balance = RoundingUtils.calculateBalance(
            privateLesson.total,
            creditAppliedAmount,
            2,
        );
        await privateLessonRepo.save(privateLesson);
    }

    /**
     * Delete any CREDIT_USED lesson payments that belong to the same lesson
     * credit chain.
     */
    async deleteLessonCreditCascade(paymentId: number): Promise<void> {
        const lessonCredit = await this.lessonPaymentRepository
            .createQueryBuilder('lp')
            .where('lp.paymentId = :paymentId', { paymentId })
            .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
            .getOne();

        if (!lessonCredit) return;

        const creditUsedLpsQuery = this.lessonPaymentRepository
            .createQueryBuilder('lp')
            .innerJoinAndSelect('lp.payment', 'p')
            .where('lp.lessonId = :lessonId', { lessonId: lessonCredit.lessonId })
            .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
            .andWhere('p.isDeleted = :pDeleted', { pDeleted: 0 })
            .andWhere('p.paymentMethodId = :creditUsed', { creditUsed: PaymentMethodType.CREDIT_USED });

        if (lessonCredit.enrolmentId === null || lessonCredit.enrolmentId === undefined) {
            creditUsedLpsQuery.andWhere('lp.enrolmentId IS NULL');
        } else {
            creditUsedLpsQuery.andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId: lessonCredit.enrolmentId });
        }

        const creditUsedLessonPayments = await creditUsedLpsQuery.getMany();

        for (const lp of creditUsedLessonPayments) {
            if (lp.payment && !lp.payment.isDeleted) {
                await this.softDeletePayment(lp.payment);
                await this.softDeleteInvoicePaymentsForPayment(lp.payment.id);
                await this.softDeleteLessonPaymentsForPayment(lp.payment.id);
            }
        }
    }

    /**
     * Recompute group lesson balance and paid status after delete.
     */
    async recalculateGroupLessonBalance(
        lessonId: number,
        enrolmentId: number,
        userId?: number,
        manager: EntityManager = this.invoiceRepository.manager,
    ): Promise<void> {
        const groupLessonRepo = manager.getRepository(GroupLesson);
        const groupLesson = await groupLessonRepo.findOne({
            where: { lessonId, enrolmentId },
        });
        if (!groupLesson) return;

        const creditAppliedAmount = await this.getLessonCreditAppliedAmount(
            lessonId,
            enrolmentId,
            manager,
        );
        const balance = RoundingUtils.calculateBalance(
            groupLesson.total,
            creditAppliedAmount,
            2,
        );

        groupLesson.balance = balance;
        groupLesson.paidStatus =
            balance === 0
                ? GroupLesson.STATUS_PAID
                : balance < 0
                    ? GroupLesson.STATUS_CREDIT
                    : GroupLesson.STATUS_OWING;
        if (userId !== undefined) {
            groupLesson.updatedByUserId = userId;
        }
        await groupLessonRepo.save(groupLesson);
    }

    /**
     * Sum active invoice-payment amounts for an invoice.
     */
    async getPaymentTotal(
        invoiceId: number,
        manager: EntityManager = this.invoicePaymentRepository.manager,
    ): Promise<number> {
        const result = await manager
            .createQueryBuilder()
            .select('COALESCE(SUM(ip.amount), 0)', 'paymentTotal')
            .from('invoice_payment', 'ip')
            .innerJoin('payment', 'p', 'p.id = ip.payment_id AND p.isDeleted = 0')
            .where('ip.invoice_id = :invoiceId', { invoiceId })
            .andWhere('ip.isDeleted = 0')
            .getRawOne();

        return parseFloat(result?.paymentTotal) || 0;
    }

    /**
     * Sum invoice-payment amounts excluding CREDIT_USED rows.
     */
    async getAppliedPaymentTotal(
        invoiceId: number,
        manager: EntityManager = this.invoicePaymentRepository.manager,
    ): Promise<number> {
        const result = await manager
            .createQueryBuilder()
            .select('COALESCE(SUM(ip.amount), 0)', 'appliedTotal')
            .from('invoice_payment', 'ip')
            .innerJoin('payment', 'p', 'p.id = ip.payment_id AND p.isDeleted = 0')
            .where('ip.invoice_id = :invoiceId', { invoiceId })
            .andWhere('ip.isDeleted = 0')
            .andWhere('p.payment_method_id != :creditUsed', { creditUsed: PaymentMethodType.CREDIT_USED })
            .getRawOne();

        return parseFloat(result?.appliedTotal) || 0;
    }

    /**
     * Sum invoice-payment amounts for CREDIT_USED rows only.
     */
    async getCreditUsedTotal(
        invoiceId: number,
        manager: EntityManager = this.invoicePaymentRepository.manager,
    ): Promise<number> {
        const result = await manager
            .createQueryBuilder()
            .select('COALESCE(SUM(ip.amount), 0)', 'creditUsedTotal')
            .from('invoice_payment', 'ip')
            .innerJoin('payment', 'p', 'p.id = ip.payment_id AND p.isDeleted = 0')
            .where('ip.invoice_id = :invoiceId', { invoiceId })
            .andWhere('ip.isDeleted = 0')
            .andWhere('p.payment_method_id = :creditUsed', { creditUsed: PaymentMethodType.CREDIT_USED })
            .getRawOne();

        return parseFloat(result?.creditUsedTotal) || 0;
    }

    /**
     * Sum active invoice line-item net totals for invoice recalculation.
     */
    async getLineItemSubtotal(
        invoiceId: number,
        manager: EntityManager = this.invoiceRepository.manager,
    ): Promise<number> {
        const result = await manager
            .createQueryBuilder()
            .select('COALESCE(SUM(ili.netTotal), 0)', 'netSubtotal')
            .from('invoice_line_item', 'ili')
            .where('ili.invoice_id = :invoiceId', { invoiceId })
            .andWhere('ili.isDeleted = 0')
            .getRawOne();

        return parseFloat(result?.netSubtotal) || 0;
    }

    /**
     * Sum active invoice line-item tax for invoice recalculation.
     */
    async getLineItemTaxSum(
        invoiceId: number,
        manager: EntityManager = this.invoiceRepository.manager,
    ): Promise<number> {
        const result = await manager
            .createQueryBuilder()
            .select('COALESCE(SUM(ili.tax_rate), 0)', 'taxTotal')
            .from('invoice_line_item', 'ili')
            .where('ili.invoice_id = :invoiceId', { invoiceId })
            .andWhere('ili.isDeleted = 0')
            .getRawOne();

        return parseFloat(result?.taxTotal) || 0;
    }

    /**
     * Update invoice totals after recalculation.
     */
    /**
     * Persist recalculated invoice totals after delete changes linked rows.
     */
    async updateInvoiceTotals(
        invoice: Invoice,
        subTotal: number,
        tax: number,
        total: number,
        balance: number,
        status: number,
        userId?: number,
        manager: EntityManager = this.invoiceRepository.manager,
    ): Promise<Invoice> {
        invoice.subTotal = subTotal;
        invoice.tax = tax;
        invoice.total = total;
        invoice.balance = balance;
        invoice.status = status;
        if (userId !== undefined) {
            invoice.updatedUserId = userId;
        }
        return manager.getRepository(Invoice).save(invoice);
    }

    /**
     * Load an invoice directly for recalculation when location validation is
     * not needed.
     */
    async findInvoiceByIdOnly(
        invoiceId: number,
        manager: EntityManager = this.invoiceRepository.manager,
    ): Promise<Invoice | null> {
        return manager.getRepository(Invoice).findOne({ where: { id: invoiceId } });
    }
    /**
     * Calculate the customer's private lesson due amount for account balance.
     */
    async getPrivateLessonsDue(customerId: number): Promise<number> {
        const result = await this.invoiceRepository.manager
            .createQueryBuilder(PrivateLesson, 'privateLesson')
            .innerJoin('privateLesson.lesson', 'lesson')
            .innerJoin('lesson.course', 'course')
            .innerJoin('course.enrolments', 'enrolment')
            .innerJoin('enrolment.student', 'student')
            .innerJoin('student.user', 'user')
            .where('user.id = :customerId', { customerId })
            .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
            .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
            .andWhere('lesson.status != :canceledStatus', { canceledStatus: 5 })
            .andWhere('privateLesson.balance > :minBalance', { minBalance: 0.09 })
            .andWhere('lesson.type = :privateType', { privateType: 1 })
            .select('COALESCE(SUM(privateLesson.balance), 0)', 'total')
            .getRawOne();

        return parseFloat(result?.total || '0') || 0;
    }

    /**
     * Calculate the customer's outstanding invoice balance.
     *
     * Canceled and void invoices are excluded: they are hidden from every invoice
     * list, so counting their leftover balance here surfaces an amount owing that
     * the customer has no way to see or pay.
     */
    async getInvoiceOwingTotal(customerId: number): Promise<number> {
        const result = await this.invoiceRepository
            .createQueryBuilder('invoice')
            .where('invoice.userId = :customerId', { customerId })
            .andWhere('invoice.type = :invoiceType', { invoiceType: Invoice.TYPE_INVOICE })
            .andWhere('invoice.balance > :minBalance', { minBalance: 0.09 })
            .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
            .andWhere('invoice.isCanceled = :isCanceled', { isCanceled: false })
            .andWhere('invoice.isVoid = :isVoid', { isVoid: 0 })
            .select('COALESCE(SUM(invoice.balance), 0)', 'total')
            .getRawOne();

        return parseFloat(result?.total || '0') || 0;
    }

    /**
     * Calculate invoice credits that reduce the customer's balance.
     */
    async getInvoiceCredits(customerId: number): Promise<number> {
        const result = await this.invoiceRepository
            .createQueryBuilder('invoice')
            .where('invoice.userId = :customerId', { customerId })
            .andWhere('ROUND(invoice.balance, 2) < :maxBalance', { maxBalance: -0.1 })
            .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
            .select('COALESCE(SUM(invoice.balance), 0)', 'total')
            .getRawOne();

        return Math.abs(parseFloat(result?.total || '0') || 0);
    }

    /**
     * Calculate rental invoice credits separately from normal invoice credits.
     */
    async getRentalInvoiceCredits(customerId: number): Promise<number> {
        const result = await this.invoiceRepository
            .createQueryBuilder('invoice')
            .where('invoice.userId = :customerId', { customerId })
            .andWhere('ROUND(invoice.balance, 2) < :maxBalance', { maxBalance: -0.1 })
            .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: true })
            .select('COALESCE(SUM(invoice.balance), 0)', 'total')
            .getRawOne();

        return Math.abs(parseFloat(result?.total || '0') || 0);
    }

    /**
     * Calculate active payment credits that should count toward customer
     * balance.
     */
    async getPaymentCredits(customerId: number): Promise<number> {
        const result = await this.paymentRepository
            .createQueryBuilder('payment')
            .where('payment.userId = :customerId', { customerId })
            .andWhere('payment.balance > :minBalance', { minBalance: 0.09 })
            .andWhere('payment.isDeleted = :isDeleted', { isDeleted: 0 })
            .andWhere('payment.paymentMethodId NOT IN (:...autoPaymentMethods)', {
                autoPaymentMethods: [PaymentMethod.TYPE_CREDIT_USED, PaymentMethod.TYPE_CREDIT_APPLIED],
            })
            .select('COALESCE(SUM(payment.balance), 0)', 'total')
            .getRawOne();

        return Math.abs(parseFloat(result?.total || '0') || 0);
    }

    /**
     * Build a unique key for a lesson/enrolment context during recursion.
     */
    private lessonContextKey(context: LessonContext): string {
        return `${context.lessonId}:${context.enrolmentId ?? ''}`;
    }

    /**
     * Sum the active lesson payments that still count as applied credit for a
     * lesson/enrolment pair.
     */
    private async getLessonCreditAppliedAmount(
        lessonId: number,
        enrolmentId: number,
        manager: EntityManager,
    ): Promise<number> {
        const query = manager
            .createQueryBuilder()
            .from('lesson_payment', 'lp')
            .select('COALESCE(SUM(lp.amount), 0)', 'total')
            .innerJoin('payment', 'p', 'p.id = lp.paymentId AND p.isDeleted = 0')
            .where('lp.lessonId = :lessonId', { lessonId })
            .andWhere('lp.isDeleted = 0')
            .andWhere('p.payment_method_id != :creditUsed', {
                creditUsed: PaymentMethodType.CREDIT_USED,
            });

        if (enrolmentId === null || enrolmentId === undefined) {
            query.andWhere('lp.enrolmentId IS NULL');
        } else {
            query.andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId });
        }

        const result = await query.getRawOne();

        return parseFloat(result?.total || '0') || 0;
    }

    /**
     * Collect the lesson/enrolment contexts touched by a payment so recursive
     * delete can find linked credit-used rows.
     */
    private async getLessonContextsForPayment(
        paymentId: number,
        manager: EntityManager,
    ): Promise<LessonContext[]> {
        const rows = await manager
            .getRepository(LessonPayment)
            .createQueryBuilder('lp')
            .distinct(true)
            .select('lp.lessonId', 'lessonId')
            .addSelect('lp.enrolmentId', 'enrolmentId')
            .where('lp.paymentId = :paymentId', { paymentId })
            .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
            .getRawMany();

        return rows
            .map((row: { lessonId: number; enrolmentId: number | null }) => ({
                lessonId: Number(row.lessonId),
                enrolmentId:
                    row.enrolmentId === null || row.enrolmentId === undefined
                        ? null
                        : Number(row.enrolmentId),
            }))
            .filter((context: LessonContext) => Number.isFinite(context.lessonId));
    }

    /**
     * Collect invoice IDs linked to a payment so invoice totals can be
     * recalculated after delete.
     */
    private async getInvoiceIdsForPayment(
        paymentId: number,
        manager: EntityManager,
    ): Promise<number[]> {
        const rows = await manager
            .getRepository(InvoicePayment)
            .createQueryBuilder('ip')
            .distinct(true)
            .select('ip.invoiceId', 'invoiceId')
            .where('ip.paymentId = :paymentId', { paymentId })
            .andWhere('ip.isDeleted = :isDeleted', { isDeleted: 0 })
            .getRawMany();

        return rows
            .map((row: { invoiceId: number }) => Number(row.invoiceId))
            .filter((invoiceId: number) => Number.isFinite(invoiceId));
    }

    /**
     * Find CREDIT_USED payment IDs for the affected lesson contexts.
     */
    private async findCreditUsedPaymentsForContexts(
        lessonContexts: LessonContext[],
        manager: EntityManager,
    ): Promise<number[]> {
        if (lessonContexts.length === 0) {
            return [];
        }

        const paymentIds = new Set<number>();

        for (const context of lessonContexts) {
            const query = manager
                .getRepository(LessonPayment)
                .createQueryBuilder('lp')
                .distinct(true)
                .select('lp.paymentId', 'paymentId')
                .innerJoin('lp.payment', 'payment')
                .where('lp.lessonId = :lessonId', { lessonId: context.lessonId })
                .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
                .andWhere('payment.paymentMethodId = :creditUsedMethodId', {
                    creditUsedMethodId: PaymentMethodType.CREDIT_USED,
                });

            if (context.enrolmentId === null || context.enrolmentId === undefined) {
                query.andWhere('lp.enrolmentId IS NULL');
            } else {
                query.andWhere('lp.enrolmentId = :enrolmentId', {
                    enrolmentId: context.enrolmentId,
                });
            }

            const matchedRows = await query.getRawMany();

            for (const row of matchedRows as Array<{ paymentId: number }>) {
                const paymentId = Number(row.paymentId);
                if (Number.isFinite(paymentId) && paymentId > 0) {
                    paymentIds.add(paymentId);
                }
            }
        }

        return [...paymentIds];
    }

    /**
     * Entry point for the recursive soft-delete cascade used by payment delete.
     */
    async deletePaymentCascade(
        paymentId: number,
        userId: number,
        manager: EntityManager,
    ): Promise<PaymentDeleteCascadeResult> {
        const visitedPaymentIds = new Set<number>();
        const touchedPaymentIds = new Set<number>();
        const affectedInvoiceIds = new Set<number>();
        const affectedLessonContexts = new Map<string, LessonContext>();

        await this.softDeletePaymentCascade(
            paymentId,
            userId,
            manager,
            visitedPaymentIds,
            touchedPaymentIds,
            affectedInvoiceIds,
            affectedLessonContexts,
        );

        return {
            touchedPaymentIds: [...touchedPaymentIds],
            affectedInvoiceIds: [...affectedInvoiceIds],
            affectedLessonContexts: [...affectedLessonContexts.values()],
        };
    }

    /**
     * Detect a negative non-credit-used payment so sibling recursive deletes are
     * not propagated in the wrong direction.
     */
    private isNegativePayment(payment: Payment): boolean {
        return Number(payment.paymentMethodId) !== PaymentMethodType.CREDIT_USED
            && Number(payment.amount) < 0;
    }

    /**
     * Recursive delete worker that soft-deletes a payment and walks linked
     * invoice, lesson, and credit-usage relationships.
     */
    private async softDeletePaymentCascade(
        paymentId: number,
        userId: number,
        manager: EntityManager,
        visitedPaymentIds: Set<number>,
        touchedPaymentIds: Set<number>,
        affectedInvoiceIds: Set<number>,
        affectedLessonContexts: Map<string, LessonContext>,
    ): Promise<void> {
        if (visitedPaymentIds.has(paymentId)) {
            touchedPaymentIds.add(paymentId);
            return;
        }
        visitedPaymentIds.add(paymentId);
        touchedPaymentIds.add(paymentId);

        const payment = await manager.getRepository(Payment).findOne({
            where: { id: paymentId },
        });

        if (!payment || Number(payment.isDeleted) === 1) {
            return;
        }

        const lessonContexts = await this.getLessonContextsForPayment(paymentId, manager);
        for (const context of lessonContexts) {
            affectedLessonContexts.set(this.lessonContextKey(context), context);
        }

        const invoiceIds = await this.getInvoiceIdsForPayment(paymentId, manager);
        for (const invoiceId of invoiceIds) {
            affectedInvoiceIds.add(invoiceId);
        }

        payment.isDeleted = 1;
        payment.updatedByUserId = userId;
        await manager.getRepository(Payment).save(payment);

        if (Number(payment.paymentMethodId) === PaymentMethodType.CREDIT_APPLIED) {
            const creditUsage = await manager.getRepository(CreditUsage).findOne({
                where: { creditPaymentId: paymentId },
            });
            if (creditUsage?.debitPaymentId) {
                await this.softDeletePaymentCascade(
                    Number(creditUsage.debitPaymentId),
                    userId,
                    manager,
                    visitedPaymentIds,
                    touchedPaymentIds,
                    affectedInvoiceIds,
                    affectedLessonContexts,
                );
            }

            const creditUsedPaymentIds = await this.findCreditUsedPaymentsForContexts(
                lessonContexts,
                manager,
            );
            for (const creditUsedPaymentId of creditUsedPaymentIds) {
                await this.softDeletePaymentCascade(
                    creditUsedPaymentId,
                    userId,
                    manager,
                    visitedPaymentIds,
                    touchedPaymentIds,
                    affectedInvoiceIds,
                    affectedLessonContexts,
                );
            }
        } else if (Number(payment.paymentMethodId) === PaymentMethodType.CREDIT_USED) {
            const creditUsage = await manager.getRepository(CreditUsage).findOne({
                where: { debitPaymentId: paymentId },
            });
            if (creditUsage?.creditPaymentId) {
                await this.softDeletePaymentCascade(
                    Number(creditUsage.creditPaymentId),
                    userId,
                    manager,
                    visitedPaymentIds,
                    touchedPaymentIds,
                    affectedInvoiceIds,
                    affectedLessonContexts,
                );
            }
        }

        const invoicePayments = await manager
            .getRepository(InvoicePayment)
            .createQueryBuilder('ip')
            .innerJoinAndSelect('ip.payment', 'payment')
            .where('ip.paymentId = :paymentId', { paymentId })
            .andWhere('ip.isDeleted = :isDeleted', { isDeleted: 0 })
            .orderBy('ip.id', 'ASC')
            .getMany();

        for (const invoicePayment of invoicePayments) {
            await this.softDeleteInvoicePaymentCascade(
                invoicePayment.id,
                payment,
                userId,
                manager,
                visitedPaymentIds,
                touchedPaymentIds,
                affectedInvoiceIds,
                affectedLessonContexts,
            );
        }

        const lessonPayments = await manager
            .getRepository(LessonPayment)
            .createQueryBuilder('lp')
            .where('lp.paymentId = :paymentId', { paymentId })
            .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
            .orderBy('lp.id', 'ASC')
            .getMany();

        if (lessonPayments.length > 0) {
            await manager
                .createQueryBuilder()
                .update(LessonPayment)
                .set({ isDeleted: 1, updatedByUserId: userId })
                .where('paymentId = :paymentId', { paymentId })
                .andWhere('isDeleted = :isDeleted', { isDeleted: 0 })
                .execute();
        }
    }

    /**
     * Recursive delete worker for one invoice-payment row, including payment-
     * credit invoice follow-up.
     */
    private async softDeleteInvoicePaymentCascade(
        invoicePaymentId: number,
        sourcePayment: Payment,
        userId: number,
        manager: EntityManager,
        visitedPaymentIds: Set<number>,
        touchedPaymentIds: Set<number>,
        affectedInvoiceIds: Set<number>,
        affectedLessonContexts: Map<string, LessonContext>,
    ): Promise<void> {
        const invoicePayment = await manager
            .getRepository(InvoicePayment)
            .createQueryBuilder('ip')
            .innerJoinAndSelect('ip.payment', 'payment')
            .where('ip.id = :invoicePaymentId', { invoicePaymentId })
            .getOne();

        if (!invoicePayment) {
            return;
        }

        touchedPaymentIds.add(invoicePayment.paymentId);

        if (Number(invoicePayment.isDeleted) === 1) {
            return;
        }

        affectedInvoiceIds.add(invoicePayment.invoiceId);

        invoicePayment.isDeleted = 1;
        invoicePayment.updatedByUserId = userId;
        await manager.getRepository(InvoicePayment).save(invoicePayment);

        const isPaymentCreditInvoice = await this.isPaymentCreditInvoice(
            invoicePayment.invoiceId,
            manager,
        );

        if (!isPaymentCreditInvoice) {
            return;
        }

        const remainingInvoicePayments = await manager
            .getRepository(InvoicePayment)
            .createQueryBuilder('ip')
            .innerJoinAndSelect('ip.payment', 'payment')
            .where('ip.invoiceId = :invoiceId', { invoiceId: invoicePayment.invoiceId })
            .andWhere('ip.isDeleted = :isDeleted', { isDeleted: 0 })
            .orderBy('ip.id', 'ASC')
            .getMany();

        for (const remainingInvoicePayment of remainingInvoicePayments) {
            await this.softDeleteInvoicePaymentCascade(
                remainingInvoicePayment.id,
                remainingInvoicePayment.payment,
                userId,
                manager,
                visitedPaymentIds,
                touchedPaymentIds,
                affectedInvoiceIds,
                affectedLessonContexts,
            );

            if (!this.isNegativePayment(sourcePayment)) {
                await this.softDeletePaymentCascade(
                    remainingInvoicePayment.paymentId,
                    userId,
                    manager,
                    visitedPaymentIds,
                    touchedPaymentIds,
                    affectedInvoiceIds,
                    affectedLessonContexts,
                );
            }
        }
    }

    /**
     * Persist the final customer account balance after the delete cascade
     * finishes recalculating dependent values.
     */
    async updateCustomerAccountBalance(customerId: number, balance: number): Promise<void> {
        const customerAccountRepo = this.invoiceRepository.manager.getRepository(CustomerAccount);
        const customerAccount = await customerAccountRepo.findOne({
            where: { customerId },
        });

        if (customerAccount) {
            customerAccount.balance = balance;
            await customerAccountRepo.save(customerAccount);
        }
    }
}
