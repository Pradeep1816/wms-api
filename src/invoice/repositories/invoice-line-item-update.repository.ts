import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';
import { TaxStatus } from '../../tax/entities/tax-status.entity';
import { TaxTypeTaxStatusAssoc } from '../../tax/entities/tax-type-tax-status-assoc.entity';
import { TaxType } from '../../tax/entities/tax-type.entity';
import { TaxCode } from '../../tax/entities/tax-code.entity';
import { InvoiceReverse } from '../entities/invoice-reverse.entity';
import { resolveRoyaltySnapshot, RoyaltySnapshot } from '../../utils/royality/royalty-calculation.util';

@Injectable()
export class InvoiceLineItemUpdateRepository {
    constructor(
        @InjectRepository(Invoice)
        private readonly invoiceRepository: Repository<Invoice>,
        @InjectRepository(InvoiceLineItem)
        private readonly lineItemRepository: Repository<InvoiceLineItem>,
        @InjectRepository(TaxStatus)
        private readonly taxStatusRepository: Repository<TaxStatus>,
        @InjectRepository(TaxTypeTaxStatusAssoc)
        private readonly taxAssocRepository: Repository<TaxTypeTaxStatusAssoc>,
        @InjectRepository(TaxType)
        private readonly taxTypeRepository: Repository<TaxType>,
        @InjectRepository(TaxCode)
        private readonly taxCodeRepository: Repository<TaxCode>,
        @InjectRepository(InvoiceReverse)
        private readonly invoiceReverseRepository: Repository<InvoiceReverse>,
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

    async getRoyaltySnapshot(
        locationId: number,
        itemId: number,
        royaltyFree: number,
    ): Promise<RoyaltySnapshot> {
        return resolveRoyaltySnapshot(
            this.lineItemRepository.manager,
            locationId,
            itemId,
            royaltyFree,
        );
    }

    /**
     * Get first non-deleted line item for the invoice (to check item type).
     */
    async getFirstLineItem(invoiceId: number): Promise<InvoiceLineItem | null> {
        return this.lineItemRepository
            .createQueryBuilder('li')
            .where('li.invoiceId = :invoiceId', { invoiceId })
            .andWhere('li.isDeleted = :isDeleted', { isDeleted: false })
            .getOne();
    }

    /**
     * Check if an invoice is a reversed invoice.
     */
    async isReversedInvoice(invoiceId: number): Promise<boolean> {
        const count = await this.invoiceReverseRepository.count({
            where: { reversedInvoiceId: invoiceId },
        });
        return count > 0;
    }

    /**
     * Look up tax data from the chain: tax_status → tax_type_tax_status_assoc → tax_type → tax_code
     * Matches legacy InvoiceLineItem::beforeSave() tax recalculation.
     *
     * @param taxStatusName - The tax_status name on the line item
     * @returns { taxTypeName, taxCodeRate } or null if not found
     */
    async lookupTaxData(
        taxStatusName: string,
    ): Promise<{ taxTypeName: string; taxCodeRate: number } | null> {
        const taxStatus = await this.taxStatusRepository.findOne({
            where: { name: taxStatusName },
        });
        if (!taxStatus) return null;

        const assoc = await this.taxAssocRepository.findOne({
            where: { taxStatusId: taxStatus.id },
        });
        if (!assoc) return null;

        const taxType = await this.taxTypeRepository.findOne({
            where: { id: assoc.taxTypeId },
        });
        if (!taxType) return null;

        const taxCode = await this.taxCodeRepository.findOne({
            where: { taxTypeId: taxType.id },
        });
        if (!taxCode) return null;

        return {
            taxTypeName: taxType.name,
            taxCodeRate: parseFloat(String(taxCode.rate)) || 0,
        };
    }

    /**
     * Save updated line item fields to the database.
     */
    async updateLineItem(
        lineItemId: number,
        updateFields: Partial<InvoiceLineItem>,
    ): Promise<void> {
        await this.lineItemRepository.update(lineItemId, updateFields);
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
     * Update all invoice totals after a line item update.
     * Matches legacy Invoice::beforeSave() cascade.
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
}
