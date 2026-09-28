import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';
import { InvoiceLineItemDiscount } from '../entities/invoice-line-item-discount.entity';
import { InvoiceReverse } from '../entities/invoice-reverse.entity';
import { Item } from '../../item/entities/item.entity';
import { CustomerDiscount } from '../../customer/entities/customer-discount.entity';
import { resolveRoyaltySnapshot, RoyaltySnapshot } from '../../utils/royality/royalty-calculation.util';

@Injectable()
export class InvoiceLineItemCreateRepository {
    constructor(
        @InjectRepository(Invoice)
        private readonly invoiceRepository: Repository<Invoice>,
        @InjectRepository(InvoiceLineItem)
        private readonly lineItemRepository: Repository<InvoiceLineItem>,
        @InjectRepository(InvoiceLineItemDiscount)
        private readonly discountRepository: Repository<InvoiceLineItemDiscount>,
        @InjectRepository(Item)
        private readonly itemRepository: Repository<Item>,
        @InjectRepository(CustomerDiscount)
        private readonly customerDiscountRepository: Repository<CustomerDiscount>,
    ) { }

    /**
     * Find an invoice by ID, scoped to location, not deleted.
     * Matches legacy: $this->findModel($id)
     */
    async findInvoiceById(
        locationId: number,
        invoiceId: number,
    ): Promise<Invoice | null> {
        return this.invoiceRepository.findOne({
            where: {
                id: invoiceId,
                locationId,
                isDeleted: false,
            },
            relations: ['user'],
        });
    }

    /**
     * Find an item (catalog) by ID, not deleted.
     * Matches legacy: Item::findOne($itemId)
     */
    async findItemById(itemId: number): Promise<Item | null> {
        return this.itemRepository.findOne({
            where: {
                id: itemId,
                isDeleted: false,
            },
        });
    }

    async getRoyaltySnapshot(
        locationId: number,
        item: Item,
    ): Promise<RoyaltySnapshot> {
        return resolveRoyaltySnapshot(
            this.lineItemRepository.manager,
            locationId,
            item,
        );
    }

    /**
     * Check if an item already exists as a non-deleted line item on the invoice.
     * Matches legacy: foreach ($invoice->lineItems as $lineItem) { if ($lineItem->item_id === $this->id) }
     */
    async findExistingLineItem(
        invoiceId: number,
        itemId: number,
    ): Promise<InvoiceLineItem | null> {
        return this.lineItemRepository.findOne({
            where: {
                invoiceId,
                itemId,
                isDeleted: false,
            },
            relations: ['discounts'],
        });
    }

    /**
     * Check whether this invoice is already a reversed / credit invoice.
     */
    async isReversedInvoice(invoiceId: number): Promise<boolean> {
        const count = await this.invoiceRepository.manager
            .createQueryBuilder(InvoiceReverse, 'ir')
            .where('ir.reversedInvoiceId = :invoiceId', { invoiceId })
            .getCount();

        return count > 0;
    }

    /**
     * Lookup tax data through the 5-table chain:
     *   item.taxStatusId → tax_status → tax_type_tax_status_assoc → tax_type → tax_code
     *
     * Returns: { taxTypeName, taxCodeRate, taxCodeCode, taxStatusName }
     * Matches legacy: InvoiceLineItem::beforeSave tax-chain lookups
     */
    async getTaxDataForItem(taxStatusId: number): Promise<{
        taxTypeName: string;
        taxCodeRate: number;
        taxCodeCode: string;
        taxStatusName: string;
    } | null> {
        const result = await this.invoiceRepository.manager
            .createQueryBuilder()
            .select('ts.name', 'taxStatusName')
            .addSelect('tt.name', 'taxTypeName')
            .addSelect('tc.rate', 'taxCodeRate')
            .addSelect('tc.code', 'taxCodeCode')
            .from('tax_status', 'ts')
            .innerJoin('tax_type_tax_status_assoc', 'ttsa', 'ttsa.tax_status_id = ts.id')
            .innerJoin('tax_type', 'tt', 'tt.id = ttsa.tax_type_id')
            .innerJoin('tax_code', 'tc', 'tc.tax_type_id = tt.id')
            .where('ts.id = :taxStatusId', { taxStatusId })
            .getRawOne();

        if (!result) return null;

        return {
            taxTypeName: result.taxTypeName,
            taxCodeRate: parseFloat(result.taxCodeRate) || 0,
            taxCodeCode: result.taxCodeCode,
            taxStatusName: result.taxStatusName,
        };
    }

    /**
     * Save a new or updated InvoiceLineItem.
     */
    async saveLineItem(lineItem: InvoiceLineItem): Promise<InvoiceLineItem> {
        return this.lineItemRepository.save(lineItem);
    }

    /**
     * Get customer discount value for the invoice customer.
     * Matches legacy: $user->customerDiscount->value
     */
    async getCustomerDiscount(userId: number): Promise<CustomerDiscount | null> {
        return this.customerDiscountRepository.findOne({
            where: {
                customerId: userId,
                isDeleted: false,
            },
        });
    }

    /**
     * Create an InvoiceLineItemDiscount record for customer discount.
     * Matches legacy: addCustomerDiscount()
     */
    async createCustomerDiscount(
        lineItemId: number,
        discountValue: number,
    ): Promise<InvoiceLineItemDiscount> {
        const discount = this.discountRepository.create({
            invoiceLineItemId: lineItemId,
            valueType: InvoiceLineItemDiscount.VALUE_TYPE_PERCENTAGE,
            type: InvoiceLineItemDiscount.TYPE_CUSTOMER,
            value: discountValue,
        });
        return this.discountRepository.save(discount);
    }

    /**
     * Get all non-deleted line items with their discounts for an invoice.
     * Used to recalculate invoice subtotal.
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
     * Update all invoice totals after a line item is added.
     * Matches legacy: Invoice::beforeSave (update path)
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
