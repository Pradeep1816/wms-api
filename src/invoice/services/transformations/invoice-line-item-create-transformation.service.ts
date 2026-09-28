import { Injectable } from '@nestjs/common';
import { Invoice } from '../../entities/invoice.entity';
import { InvoiceLineItem } from '../../entities/invoice-line-item.entity';
import { InvoiceDiscountCalculator } from '../calculations/invoice-discount.calculator';
import { RoundingUtils } from '../../../utils/rounding.utils';
import { Item } from '../../../item/entities/item.entity';
import { ItemTypeEnum } from '../../enums/item-type.enum';
import { CreateLineItemResponseDto } from '../../dto/create-invoice-line-item-request.dto';
import { RoyaltySnapshot } from '../../../utils/royality/royalty-calculation.util';

type TaxData = {
    taxTypeName: string;
    taxCodeRate: number;
    taxCodeCode: string;
    taxStatusName: string;
};

@Injectable()
export class InvoiceLineItemCreateTransformationService {
    constructor(
        private readonly discountCalculator: InvoiceDiscountCalculator,
    ) { }

    /**
     * Build a new InvoiceLineItem entity with all auto-populated fields.
     * Matches legacy Item::addToInvoice (new item path) + InvoiceLineItem::beforeSave (insert).
     *
     * Fields set:
     *   From Item: invoice_id, item_id, unit, description, amount, item_type_id, cost
     *   From beforeSave: code, tax_type, tax_rate, tax_code, tax_status, netTotal, royaltyFree, rate, isDeleted
     */
    buildNewLineItem(
        invoice: Invoice,
        item: Item,
        taxData: TaxData,
        royaltySnapshot: RoyaltySnapshot,
    ): InvoiceLineItem {
        const lineItem = new InvoiceLineItem();

        // Fields from Item::addToInvoice
        lineItem.invoiceId = invoice.id;
        lineItem.itemId = item.id;
        lineItem.unit = 1;
        lineItem.description = item.description;
        lineItem.amount = item.price;
        lineItem.itemTypeId = ItemTypeEnum.TYPE_MISC;
        lineItem.cost = 0;

        // Fields from InvoiceLineItem::beforeSave (insert path)
        // For misc items: isDefaultDiscountedItems() returns true → rate = 0
        lineItem.rate = 0;
        lineItem.code = item.code;
        lineItem.taxType = taxData.taxTypeName;
        lineItem.taxStatus = taxData.taxStatusName;
        lineItem.taxCode = taxData.taxCodeCode;
        lineItem.royaltyFree = item.royaltyFree;
        lineItem.royaltyCategoryId = royaltySnapshot.categoryId || null;
        lineItem.royaltyRateApplied = royaltySnapshot.rate;
        lineItem.advertisementRateApplied = royaltySnapshot.advertisementRate;
        lineItem.isDeleted = false;

        return this.refreshLineItemPricing(lineItem, invoice, taxData.taxCodeRate);
    }

    /**
     * Recalculate a line item's netTotal and taxRate using the current discounts.
     * Mirrors the legacy "save the line item again after discount insert" cascade.
     */
    refreshLineItemPricing(
        lineItem: InvoiceLineItem,
        invoice: Invoice,
        taxCodeRate: number,
    ): InvoiceLineItem {
        const netPrice = this.calculateNetPrice(lineItem, invoice);

        lineItem.taxRate = netPrice * taxCodeRate / 100.0;
        lineItem.netTotal = netPrice;

        return lineItem;
    }

    /**
     * Calculate gross price for a line item.
     */
    private getGrossPrice(lineItem: InvoiceLineItem): number {
        const isGroupLesson = lineItem.itemTypeId === ItemTypeEnum.TYPE_GROUP_LESSON;
        if (isGroupLesson) {
            return RoundingUtils.roundHalfUp(lineItem.amount, 2);
        }
        return RoundingUtils.roundHalfUp(lineItem.amount * lineItem.unit, 2);
    }

    private calculateNetPrice(lineItem: InvoiceLineItem, invoice: Invoice): number {
        const grossPrice = this.getGrossPrice(lineItem);
        const discountAmount = this.discountCalculator.calculateLineItemDiscount(lineItem, invoice);
        return grossPrice - RoundingUtils.roundHalfUp(discountAmount, 2);
    }

    /**
     * Recalculate invoice totals after a line item has been added.
     * Same logic as delete transformation — Invoice::beforeSave (update path).
     */
    transformCreateTotals(
        allLineItems: InvoiceLineItem[],
        invoice: Invoice,
        lineItemTaxSum: number,
        paidAmount: number,
    ): {
        newSubTotal: number;
        newTax: number;
        newTotal: number;
        newBalance: number;
        newStatus: number;
    } {
        // subTotal = SUM of all line items' netPrice
        let newSubTotal = 0;
        for (const li of allLineItems) {
            // Adding a book must not reprice existing lesson rounding or saved POS snapshots.
            newSubTotal += li.netTotal != null && (li.isPos || li.itemTypeId === ItemTypeEnum.TYPE_PRIVATE_LESSON)
                ? Number(li.netTotal) : this.calculateNetPrice(li, invoice);
        }

        // tax = preserve manual adjustment, otherwise use line item sum
        const newTax = invoice.isTaxAdjusted
            ? parseFloat(String(invoice.tax)) || 0
            : lineItemTaxSum;

        // total = subTotal + tax
        const newTotal = newSubTotal + newTax;

        // status
        const roundedTotal = RoundingUtils.roundHalfUp(newTotal, 2);
        const roundedPaid = RoundingUtils.roundHalfUp(paidAmount, 2);

        let newStatus: number;
        if (roundedTotal === roundedPaid) {
            newStatus = Invoice.STATUS_PAID;
        } else if (roundedTotal > roundedPaid) {
            newStatus = Invoice.STATUS_OWING;
        } else {
            newStatus = Invoice.STATUS_CREDIT;
        }

        // balance
        const newBalance = roundedPaid === roundedTotal
            ? 0
            : roundedTotal - roundedPaid;

        return { newSubTotal, newTax, newTotal, newBalance, newStatus };
    }

    /**
     * Transform into the create line item response DTO.
     */
    transformCreateLineItemResponse(
        lineItemId: number,
    ): CreateLineItemResponseDto {
        return {
            id: lineItemId,
        } as CreateLineItemResponseDto;
    }
}
