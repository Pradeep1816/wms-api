import { Injectable } from '@nestjs/common';
import { Invoice } from '../../entities/invoice.entity';
import { InvoiceLineItem } from '../../entities/invoice-line-item.entity';
import { InvoiceDiscountCalculator } from '../calculations/invoice-discount.calculator';
import { RoundingUtils } from '../../../utils/rounding.utils';
import { EditTaxLineItemResponseDto } from '../../dto/edit-tax-line-item-request.dto';
import { InvoiceType } from '../../enums/invoice-type.enum';
import { ItemTypeEnum } from '../../enums/item-type.enum';

@Injectable()
export class InvoiceLineItemEditTaxTransformationService {
    constructor(
        private readonly discountCalculator: InvoiceDiscountCalculator,
    ) { }

    // Calculate gross price: group lessons = amount, others = amount × unit
    private getGrossPrice(lineItem: InvoiceLineItem): number {
        const isGroupLesson = lineItem.itemTypeId === ItemTypeEnum.TYPE_GROUP_LESSON;

        if (isGroupLesson) {
            return RoundingUtils.roundHalfUp(lineItem.amount, 2);
        } else {
            return RoundingUtils.roundHalfUp(lineItem.amount * lineItem.unit, 2);
        }
    }

    // Calculate net price: grossPrice - discount
    private calculateNetPrice(lineItem: InvoiceLineItem, invoice: Invoice): number {
        const grossPrice = this.getGrossPrice(lineItem);
        const discountAmount = this.discountCalculator.calculateLineItemDiscount(lineItem, invoice);
        return grossPrice - RoundingUtils.roundHalfUp(discountAmount, 2);
    }

    // Calculate updated tax fields: tax_status, tax_type, tax_rate, netTotal
    calculateUpdatedTaxFields(
        lineItem: InvoiceLineItem,
        newTaxStatus: string,
        taxData: { taxTypeName: string; taxCodeRate: number },
        invoice: Invoice,
    ): Partial<InvoiceLineItem> {
        const netPrice = this.calculateNetPrice(lineItem, invoice);

        return {
            taxStatus: newTaxStatus,
            taxType: taxData.taxTypeName,
            taxRate: netPrice * taxData.taxCodeRate / 100.0,
            netTotal: netPrice,
        };
    }

    /**
     * Recalculate invoice totals: subTotal, tax, total, balance, status
     * @param allLineItems - All non-deleted line items for the invoice (with discounts)
     * @param invoice - The parent invoice
     * @param lineItemTaxSum - Sum of all line item tax_rate values (after updates)
     * @param paidAmount - Total paid amount on the invoice
     */
    calculateInvoiceCascade(
        allLineItems: InvoiceLineItem[],
        invoice: Invoice,
        lineItemTaxSum: number,
        paidAmount: number,
    ): {
        subTotal: number;
        tax: number;
        total: number;
        balance: number;
        status: number;
    } {
        // Step 1: Calculate subTotal from all line items
        let subTotal = 0;
        for (const li of allLineItems) {
            subTotal += this.calculateNetPrice(li, invoice);
        }

        // Step 2: Tax — always use fresh sum since we just edited taxes
        // Legacy sets isTaxAdjusted = false in actionEditTax, so we never preserve manual tax
        const tax = lineItemTaxSum;

        // Step 3: Total = subTotal + tax
        const total = subTotal + tax;

        // Step 4: Calculate balance and status
        const roundedTotal = RoundingUtils.roundHalfUp(total, 2);
        const roundedPaid = RoundingUtils.roundHalfUp(paidAmount, 2);

        let status: number;
        if (roundedTotal === roundedPaid) {
            status = Invoice.STATUS_PAID;
        } else if (roundedTotal > roundedPaid) {
            status = Invoice.STATUS_OWING;
        } else {
            status = Invoice.STATUS_CREDIT;
        }

        // For pro-forma invoices, status calculation differs
        if (invoice.type !== InvoiceType.INVOICE) {
            if (roundedPaid >= roundedTotal) {
                status = Invoice.STATUS_PAID;
            } else {
                status = Invoice.STATUS_OWING;
            }
        }

        const balance = roundedPaid === roundedTotal
            ? 0
            : roundedTotal - roundedPaid;

        return { subTotal, tax, total, balance, status };
    }

    // Transform response DTO
    transformResponse(updatedCount: number, taxRate?: number): EditTaxLineItemResponseDto {
        return {
            updatedCount,
            taxRate,
        } as EditTaxLineItemResponseDto;
    }
}
