import { Injectable } from '@nestjs/common';
import { Invoice } from '../../entities/invoice.entity';
import { InvoiceLineItem } from '../../entities/invoice-line-item.entity';
import { InvoiceDiscountCalculator } from '../calculations/invoice-discount.calculator';
import { RoundingUtils } from '../../../utils/rounding.utils';
import { ItemTypeEnum } from '../../enums/item-type.enum';
import { DeleteLineItemResponseDto } from '../../dto/delete-invoice-line-item-request.dto';

@Injectable()
export class InvoiceLineItemDeleteTransformationService {
    constructor(
        private readonly discountCalculator: InvoiceDiscountCalculator,
    ) { }

    /**
     * Calculate gross price for a line item.
     * For group lessons: grossPrice = amount
     * For all other types: grossPrice = amount × unit
     */
    private getGrossPrice(lineItem: InvoiceLineItem): number {
        const isGroupLesson = lineItem.itemTypeId === ItemTypeEnum.TYPE_GROUP_LESSON;

        if (isGroupLesson) {
            return RoundingUtils.roundHalfUp(lineItem.amount, 2);
        } else {
            return RoundingUtils.roundHalfUp(lineItem.amount * lineItem.unit, 2);
        }
    }

    /**
     * Calculate net price for a single line item.
     * netPrice = grossPrice - discount
     */
    private calculateNetPrice(lineItem: InvoiceLineItem, invoice: Invoice): number {
        const grossPrice = this.getGrossPrice(lineItem);
        const discountAmount = this.discountCalculator.calculateLineItemDiscount(lineItem, invoice);
        return grossPrice - RoundingUtils.roundHalfUp(discountAmount, 2);
    }

    /**
     * Recalculate invoice totals after a line item has been soft-deleted.
     *   subTotal = SUM(remaining lineItems' netPrice)
     *   tax = SUM(remaining lineItems' tax_rate) unless isTaxAdjusted
     *   total = subTotal + tax
     *   status = computed from total vs paidAmount
     *   balance = total - paidAmount
     *
     * @param remainingLineItems - All non-deleted line items (after the delete)
     * @param invoice - Parent invoice entity
     * @param lineItemTaxSum - SUM(tax_rate) of remaining line items
     * @param paidAmount - Total paid amount on this invoice
     */
    transformDeleteTotals(
        remainingLineItems: InvoiceLineItem[],
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
        // Step 1: subTotal = SUM of remaining line items' netPrice
        let newSubTotal = 0;
        for (const li of remainingLineItems) {
            newSubTotal += this.calculateNetPrice(li, invoice);
        }

        // Step 2: tax = preserve manual adjustment, otherwise use line item sum
        const newTax = invoice.isTaxAdjusted
            ? parseFloat(String(invoice.tax)) || 0
            : lineItemTaxSum;

        // Step 3: total = subTotal + tax
        const newTotal = newSubTotal + newTax;

        // Step 4: status
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

        // Step 5: balance
        const newBalance = roundedPaid === roundedTotal
            ? 0
            : roundedTotal - roundedPaid;

        return {
            newSubTotal,
            newTax,
            newTotal,
            newBalance,
            newStatus,
        };
    }

    /**
     * Transform into the delete line item response DTO.
     */
    transformDeleteLineItemResponse(lineItemId: number): DeleteLineItemResponseDto {
        return {
            id: lineItemId,
        } as DeleteLineItemResponseDto;
    }
}
