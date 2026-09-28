import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';
import { TaxStatus } from '../../tax/entities/tax-status.entity';
import { TaxTypeTaxStatusAssoc } from '../../tax/entities/tax-type-tax-status-assoc.entity';
import { TaxType } from '../../tax/entities/tax-type.entity';
import { TaxCode } from '../../tax/entities/tax-code.entity';
import { getCurrentESTDate } from '../../utils/date-utils';
import { ProvinceRepository } from '../../location/repositories/province.repository';

@Injectable()
export class InvoiceLineItemEditTaxRepository {
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
        private readonly provinceRepository: ProvinceRepository,
    ) { }

    /**
     * Find multiple line items by IDs, joined with their invoice, scoped to location.
     * Matches legacy: fetching line items in the foreach loop of actionEditTax().
     */
    async findLineItemsByIds(
        locationId: number,
        lineItemIds: number[],
    ): Promise<InvoiceLineItem[]> {
        return this.lineItemRepository
            .createQueryBuilder('li')
            .innerJoinAndSelect('li.invoice', 'invoice')
            .leftJoinAndSelect('li.discounts', 'discount')
            .where('li.id IN (:...lineItemIds)', { lineItemIds })
            .andWhere('li.isDeleted = :isDeleted', { isDeleted: false })
            .andWhere('invoice.locationId = :locationId', { locationId })
            .andWhere('invoice.isDeleted = :invoiceDeleted', { invoiceDeleted: false })
            .getMany();
    }

    /**
     * Look up tax data from the chain: tax_status → tax_type_tax_status_assoc → tax_type → tax_code
     * Matches legacy InvoiceLineItem::beforeSave() tax resolution chain.
     *
     * @param taxStatusName - The tax_status name (e.g., "Default", "No Tax", "GST Only")
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
     * Save updated tax fields on a single line item.
     */
    async updateLineItemTax(
        lineItemId: number,
        updateFields: Partial<InvoiceLineItem>,
    ): Promise<void> {
        await this.lineItemRepository.update(lineItemId, updateFields);
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
     * Update all invoice totals after tax edit.
     * Matches legacy Invoice::beforeSave() cascade + isTaxAdjusted = false from actionEditTax().
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
        invoice.isTaxAdjusted = 0;
        return this.invoiceRepository.save(invoice);
    }

    /**
     * Get all available tax statuses for dropdown.
     */
    async getAllTaxStatuses(): Promise<TaxStatus[]> {
        return this.taxStatusRepository.find({
            order: { id: 'ASC' },
        });
    }

    /**
     * Get province ID for a location.
     */
    async getProvinceIdByLocation(locationId: number): Promise<number | null> {
        const provinceId = await this.provinceRepository.getProvinceId(locationId);
        return provinceId ?? null;
    }

    /**
     * Get tax status by name.
     */
    async getTaxStatusByName(taxStatusName: string): Promise<TaxStatus | null> {
        return this.taxStatusRepository.findOne({
            where: { name: taxStatusName },
        });
    }

    /**
     * Get tax type association by tax status ID.
     */
    async getTaxAssocByStatusId(taxStatusId: number): Promise<TaxTypeTaxStatusAssoc | null> {
        return this.taxAssocRepository.findOne({
            where: { taxStatusId },
        });
    }

    /**
     * Get tax code by tax type, province, and date.
     */
    async getTaxCodeByTypeAndProvince(
        taxTypeId: number,
        provinceId: number,
    ): Promise<TaxCode | null> {
        const today = getCurrentESTDate();
        
        return this.taxCodeRepository
            .createQueryBuilder('tc')
            .where('tc.taxTypeId = :taxTypeId', { taxTypeId })
            .andWhere('tc.startDate <= :today', { today })
            .andWhere('tc.provinceId = :provinceId', { provinceId })
            .orderBy('tc.startDate', 'DESC')
            .getOne();
    }

    /**
     * Batch fetch tax associations by multiple tax status IDs.
     */
    async getTaxAssocsByStatusIds(taxStatusIds: number[]): Promise<TaxTypeTaxStatusAssoc[]> {
        return this.taxAssocRepository
            .createQueryBuilder('ta')
            .where('ta.taxStatusId IN (:...taxStatusIds)', { taxStatusIds })
            .getMany();
    }

    /**
     * Batch fetch tax codes by multiple tax type IDs and province.
     */
    async getTaxCodesByTypeIdsAndProvince(
        taxTypeIds: number[],
        provinceId: number,
    ): Promise<TaxCode[]> {
        const today = getCurrentESTDate();

        return this.taxCodeRepository
            .createQueryBuilder('tc')
            .where('tc.taxTypeId IN (:...taxTypeIds)', { taxTypeIds })
            .andWhere('tc.startDate <= :today', { today })
            .andWhere('tc.provinceId = :provinceId', { provinceId })
            .orderBy('tc.startDate', 'DESC')
            .getMany();
    }
}
