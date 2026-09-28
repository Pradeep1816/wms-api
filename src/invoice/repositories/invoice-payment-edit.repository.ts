import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Payment } from '../../payment/entities/payment.entity';
import { InvoicePayment } from '../entities/invoice-payment.entity';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';
import { Invoice } from '../entities/invoice.entity';
import { LessonPayment } from '../../payment/entities/lesson-payment.entity';
import { CreditUsage } from '../../payment/entities/credit-usage.entity';
import { GroupLesson } from '../../lesson/entities/group-lesson.entity';
import { parseLocalDateTime, getCurrentESTDate } from '../../utils/date-utils';
import { RoundingUtils } from '../../utils/rounding.utils';

@Injectable()
export class InvoicePaymentEditRepository {
    constructor(
        @InjectRepository(Payment)
        private readonly paymentRepository: Repository<Payment>,
        @InjectRepository(InvoicePayment)
        private readonly invoicePaymentRepository: Repository<InvoicePayment>,
        @InjectRepository(Invoice)
        private readonly invoiceRepository: Repository<Invoice>,
        @InjectRepository(LessonPayment)
        private readonly lessonPaymentRepository: Repository<LessonPayment>,
        @InjectRepository(CreditUsage)
        private readonly creditUsageRepository: Repository<CreditUsage>,
        @InjectRepository(GroupLesson)
        private readonly groupLessonRepository: Repository<GroupLesson>,
    ) {}

    private getPaymentRepository(manager?: EntityManager): Repository<Payment> {
        return manager ? manager.getRepository(Payment) : this.paymentRepository;
    }

    private getInvoicePaymentRepository(manager?: EntityManager): Repository<InvoicePayment> {
        return manager ? manager.getRepository(InvoicePayment) : this.invoicePaymentRepository;
    }

    private getInvoiceRepository(manager?: EntityManager): Repository<Invoice> {
        return manager ? manager.getRepository(Invoice) : this.invoiceRepository;
    }

    private getLessonPaymentRepository(manager?: EntityManager): Repository<LessonPayment> {
        return manager ? manager.getRepository(LessonPayment) : this.lessonPaymentRepository;
    }

    private getCreditUsageRepository(manager?: EntityManager): Repository<CreditUsage> {
        return manager ? manager.getRepository(CreditUsage) : this.creditUsageRepository;
    }

    private getGroupLessonRepository(manager?: EntityManager): Repository<GroupLesson> {
        return manager ? manager.getRepository(GroupLesson) : this.groupLessonRepository;
    }

    async findPaymentById(paymentId: number, manager?: EntityManager): Promise<Payment | null> {
        return this.getPaymentRepository(manager).findOneBy({
            id: paymentId,
            isDeleted: 0,
        });
    }

    /**
     * Find all non-deleted invoice payments for a given payment ID
     * Eager loads the invoice and its first line item (for isPaymentCreditInvoice check)
     */
    async findInvoicePaymentsByPaymentId(
        paymentId: number,
        manager?: EntityManager,
    ): Promise<InvoicePayment[]> {
        return this.getInvoicePaymentRepository(manager)
            .createQueryBuilder('ip')
            .innerJoinAndSelect('ip.invoice', 'invoice')
            .where('ip.paymentId = :paymentId', { paymentId })
            .andWhere('ip.isDeleted = :isDeleted', { isDeleted: 0 })
            .getMany();
    }

    /**
     * Check if an invoice has a line item with item_type_id = TYPE_PAYMENT_CREDIT (10)
     * Matches legacy Invoice::isPaymentCreditInvoice()
     */
    async isPaymentCreditInvoice(invoiceId: number, manager?: EntityManager): Promise<boolean> {
        const lineItem = await (manager ?? this.invoicePaymentRepository.manager)
            .getRepository(InvoiceLineItem)
            .createQueryBuilder('li')
            .where('li.invoiceId = :invoiceId', { invoiceId })
            .andWhere('li.isDeleted = :isDeleted', { isDeleted: 0 })
            .orderBy('li.id', 'ASC')
            .getOne();

        if (!lineItem) {
            return false;
        }

        return lineItem.itemTypeId === 10; // ItemTypeEnum.TYPE_PAYMENT_CREDIT
    }

    /**
     * Find all non-deleted lesson payments for a given payment ID
     */
    async findLessonPaymentsByPaymentId(
        paymentId: number,
        manager?: EntityManager,
    ): Promise<LessonPayment[]> {
        return this.getLessonPaymentRepository(manager)
            .createQueryBuilder('lp')
            .where('lp.paymentId = :paymentId', { paymentId })
            .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
            .getMany();
    }

    /**
     * Update the payment record fields
     */
    async updatePayment(
        payment: Payment,
        data: {
            amount: number;
            date: string;
            paymentMethodId?: number;
            reference?: string;
            balance: number;
            updatedByUserId: number;
        },
        manager?: EntityManager,
    ): Promise<Payment> {
        payment.amount = data.amount;
        payment.date = parseLocalDateTime(data.date);
        if (data.paymentMethodId !== undefined) {
            payment.paymentMethodId = data.paymentMethodId;
        }
        if (data.reference !== undefined) {
            payment.reference = data.reference;
        }
        payment.balance = data.balance;
        payment.updatedByUserId = data.updatedByUserId;
        payment.updatedOn = getCurrentESTDate();

        return this.getPaymentRepository(manager).save(payment);
    }

    /**
     * Soft delete a payment (set isDeleted = 1)
     * Matches legacy Payment::afterSoftDelete cascade
     */
    async softDeletePayment(paymentId: number, userId: number, manager?: EntityManager): Promise<void> {
        await this.getPaymentRepository(manager).update(paymentId, {
            isDeleted: 1,
            updatedByUserId: userId,
        });
    }

    /**
     * Soft delete all invoice payments for a payment
     */
    async softDeleteInvoicePayments(paymentId: number, userId: number, manager?: EntityManager): Promise<void> {
        await this.getInvoicePaymentRepository(manager)
            .createQueryBuilder()
            .update()
            .set({ isDeleted: 1, updatedByUserId: userId })
            .where('payment_id = :paymentId', { paymentId })
            .andWhere('isDeleted = :isDeleted', { isDeleted: 0 })
            .execute();
    }

    /**
     * Soft delete all lesson payments for a payment
     */
    async softDeleteLessonPayments(paymentId: number, userId: number, manager?: EntityManager): Promise<void> {
        await this.getLessonPaymentRepository(manager)
            .createQueryBuilder()
            .update()
            .set({ isDeleted: 1, updatedByUserId: userId })
            .where('paymentId = :paymentId', { paymentId })
            .andWhere('isDeleted = :isDeleted', { isDeleted: 0 })
            .execute();
    }

    /**
     * Find credit usage where this payment is the credit side
     * For cascading soft-delete of auto payments
     */
    async findCreditUsageByCreditPaymentId(
        paymentId: number,
        manager?: EntityManager,
    ): Promise<CreditUsage | null> {
        return this.getCreditUsageRepository(manager).findOne({
            where: { creditPaymentId: paymentId },
        });
    }

    /**
     * Find credit usage where this payment is the debit side
     */
    async findCreditUsageByDebitPaymentId(
        paymentId: number,
        manager?: EntityManager,
    ): Promise<CreditUsage | null> {
        return this.getCreditUsageRepository(manager).findOne({
            where: { debitPaymentId: paymentId },
        });
    }

    /**
     * Update an invoice payment sub-amount
     */
    async updateInvoicePaymentAmount(
        invoicePaymentId: number,
        amount: number,
        userId: number,
        manager?: EntityManager,
    ): Promise<void> {
        await this.getInvoicePaymentRepository(manager).update(invoicePaymentId, {
            amount,
            updatedByUserId: userId,
        });
    }

    /**
     * Soft delete invoice payment by ID
     */
    async softDeleteInvoicePaymentById(
        invoicePaymentId: number,
        userId: number,
        manager?: EntityManager,
    ): Promise<void> {
        await this.getInvoicePaymentRepository(manager).update(invoicePaymentId, {
            isDeleted: 1,
            updatedByUserId: userId,
        });
    }

    /**
     * Find invoice payments for a specific invoice and payment
     * Matches legacy Invoice::getPaymentsById($paymentId)
     */
    async findInvoicePaymentsByInvoiceAndPayment(
        invoiceId: number,
        paymentId: number,
        manager?: EntityManager,
    ): Promise<InvoicePayment[]> {
        return this.getInvoicePaymentRepository(manager)
            .createQueryBuilder('ip')
            .where('ip.invoiceId = :invoiceId', { invoiceId })
            .andWhere('ip.paymentId = :paymentId', { paymentId })
            .andWhere('ip.isDeleted = :isDeleted', { isDeleted: 0 })
            .getMany();
    }

    /**
     * Find lesson payments for a specific lesson and payment
     * Matches legacy Lesson::getPaymentsById($paymentId)
     */
    async findLessonPaymentsByLessonAndPayment(
        lessonId: number,
        paymentId: number,
        enrolmentId?: number,
        manager?: EntityManager,
    ): Promise<LessonPayment[]> {
        const qb = this.getLessonPaymentRepository(manager)
            .createQueryBuilder('lp')
            .where('lp.lessonId = :lessonId', { lessonId })
            .andWhere('lp.paymentId = :paymentId', { paymentId })
            .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 });

        if (enrolmentId) {
            qb.andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId });
        }

        return qb.getMany();
    }

    /**
     * Update a lesson payment amount
     */
    async updateLessonPaymentAmount(
        lessonPaymentId: number,
        amount: number,
        userId: number,
        manager?: EntityManager,
    ): Promise<void> {
        await this.getLessonPaymentRepository(manager).update(lessonPaymentId, {
            amount,
            updatedByUserId: userId,
        });
    }

    /**
     * Soft delete lesson payment by ID
     */
    async softDeleteLessonPaymentById(
        lessonPaymentId: number,
        userId: number,
        manager?: EntityManager,
    ): Promise<void> {
        await this.getLessonPaymentRepository(manager).update(lessonPaymentId, {
            isDeleted: 1,
            updatedByUserId: userId,
        });
    }

    /**
     * Calculate payment balance: amount - (sum of invoice_payments + lesson_payments)
     * Matches legacy Payment::getBalanceAmount()
     */
    async calculatePaymentBalance(
        paymentId: number,
        amount: number,
        manager?: EntityManager,
    ): Promise<number> {
        const invoicePaymentSum = await this.getInvoicePaymentRepository(manager)
            .createQueryBuilder('ip')
            .select('COALESCE(SUM(ip.amount), 0)', 'total')
            .where('ip.paymentId = :paymentId', { paymentId })
            .andWhere('ip.isDeleted = :isDeleted', { isDeleted: 0 })
            .getRawOne();

        const lessonPaymentSum = await this.getLessonPaymentRepository(manager)
            .createQueryBuilder('lp')
            .select('COALESCE(SUM(lp.amount), 0)', 'total')
            .where('lp.paymentId = :paymentId', { paymentId })
            .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
            .getRawOne();

        return RoundingUtils.calculatePaymentBalance(
            amount,
            invoicePaymentSum?.total || 0,
            lessonPaymentSum?.total || 0,
        );
    }

    /**
     * Re-save an invoice to trigger balance recalculation
     * Matches legacy afterSave: $this->invoice->save()
     * Recalculates balance = total - sum(invoice_payment amounts)
     */
    async recalculateInvoiceBalance(
        invoiceId: number,
        userId: number,
        manager?: EntityManager,
    ): Promise<void> {
        const invoice = await this.getInvoiceRepository(manager).findOne({ where: { id: invoiceId } });
        if (!invoice) return;

        const paidResult = await this.getInvoicePaymentRepository(manager)
            .createQueryBuilder('ip')
            .select('COALESCE(SUM(ip.amount), 0)', 'total')
            .where('ip.invoiceId = :invoiceId', { invoiceId })
            .andWhere('ip.isDeleted = :isDeleted', { isDeleted: 0 })
            .getRawOne();

        const paidAmount = Number(paidResult?.total || 0);
        const roundedTotal = RoundingUtils.roundHalfUp(Number(invoice.total || 0), 2);
        const roundedPaid = RoundingUtils.roundHalfUp(paidAmount, 2);
        const newBalance =
            roundedPaid === roundedTotal ? 0 : RoundingUtils.roundHalfUp(roundedTotal - roundedPaid, 2);

        // Match legacy Invoice::beforeSave(): compare rounded total vs rounded paid.
        let newStatus = Invoice.STATUS_PAID;
        if (roundedTotal > roundedPaid) {
            newStatus = Invoice.STATUS_OWING;
        } else if (roundedTotal < roundedPaid) {
            newStatus = Invoice.STATUS_CREDIT;
        }

        await this.getInvoiceRepository(manager).update(invoiceId, {
            balance: newBalance,
            status: newStatus,
            updatedUserId: userId,
        });
    }

    /**
     * Find a GroupLesson by ID to get its lessonId and enrolmentId.
     * Matches legacy: GroupLesson::findOne($groupLessonPayment['id'])
     */
    async findGroupLessonById(groupLessonId: number, manager?: EntityManager): Promise<GroupLesson | null> {
        return this.getGroupLessonRepository(manager).findOne({
            where: { id: groupLessonId },
        });
    }
}
