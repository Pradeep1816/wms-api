import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';

@Injectable()
export class InvoiceLineItemDeleteRepository {
    constructor(
        @InjectRepository(Invoice)
        private readonly invoiceRepository: Repository<Invoice>,
        @InjectRepository(InvoiceLineItem)
        private readonly lineItemRepository: Repository<InvoiceLineItem>,
    ) { }

    /**
     * Find a single line item by ID, joined with its invoice, scoped to location.
     */
    async findLineItemById(
        locationId: number,
        lineItemId: number,
    ): Promise<InvoiceLineItem | null> {
        return this.lineItemRepository
            .createQueryBuilder('li')
            .innerJoinAndSelect('li.invoice', 'invoice')
            .where('li.id = :lineItemId', { lineItemId })
            .andWhere('li.isDeleted = :isDeleted', { isDeleted: false })
            .andWhere('invoice.locationId = :locationId', { locationId })
            .andWhere('invoice.isDeleted = :invoiceDeleted', { invoiceDeleted: false })
            .getOne();
    }

    /**
     * Soft delete a line item by setting isDeleted = true.
     */
    async softDeleteLineItem(lineItem: InvoiceLineItem): Promise<InvoiceLineItem> {
        lineItem.isDeleted = true;
        return this.lineItemRepository.save(lineItem);
    }

    /**
     * Get all non-deleted line items with their discounts for an invoice.
     * Used to recalculate invoice subtotal (SUM of netPrice for each line item).
     */
    async getLineItemsWithDiscounts(
        invoiceId: number,
    ): Promise<InvoiceLineItem[]> {
        return this.lineItemRepository
            .createQueryBuilder('li')
            .leftJoinAndSelect('li.discounts', 'discount')
            .where('li.invoiceId = :invoiceId', { invoiceId })
            .andWhere('li.isDeleted = :isDeleted', { isDeleted: false })
            .getMany();
    }

    /**
     * Get sum of tax_rate from all non-deleted line items for an invoice.
     */
    async getLineItemTaxSum(invoiceId: number): Promise<number> {
        const result = await this.lineItemRepository
            .createQueryBuilder('li')
            .select('COALESCE(SUM(li.taxRate), 0)', 'totalTax')
            .where('li.invoiceId = :invoiceId', { invoiceId })
            .andWhere('li.isDeleted = :isDeleted', { isDeleted: false })
            .getRawOne();

        return parseFloat(result?.totalTax) || 0;
    }

    /**
     * Get total paid amount for an invoice.
     */
    async getInvoicePaidAmount(invoiceId: number): Promise<number> {
        const result = await this.invoiceRepository.manager
            .createQueryBuilder()
            .select('COALESCE(SUM(ip.amount), 0)', 'totalPaid')
            .from('invoice_payment', 'ip')
            .innerJoin('payment', 'p', 'p.id = ip.payment_id AND p.isDeleted = 0')
            .where('ip.invoice_id = :invoiceId', { invoiceId })
            .andWhere('ip.isDeleted = 0')
            .getRawOne();

        return parseFloat(result?.totalPaid) || 0;
    }

    /**
     * Update all invoice totals after a line item delete.
     *   subTotal = netSubtotal (SUM of line items' netPrice)
     *   tax = SUM of line items' tax_rate (unless isTaxAdjusted)
     *   total = subTotal + tax
     *   status = calculated from total vs paidAmount
     *   balance = total - paidAmount
     */
    async updateInvoiceTotals(
        invoice: Invoice,
        subTotal: number,
        tax: number,
        total: number,
        balance: number,
        status: number,
        userId: number,
    ): Promise<Invoice> {
        invoice.subTotal = subTotal;
        invoice.tax = tax;
        invoice.total = total;
        invoice.balance = balance;
        invoice.status = status;
        invoice.updatedUserId = userId;
        return this.invoiceRepository.save(invoice);
    }

    /**
     * Soft delete an invoice by setting isDeleted = true.
     * AND it's a pro-forma (not invoice type), soft-delete the invoice itself.
     */
    async softDeleteInvoice(invoice: Invoice): Promise<Invoice> {
        invoice.isDeleted = true;
        return this.invoiceRepository.save(invoice);
    }
}
