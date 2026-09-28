import { Injectable } from '@nestjs/common';
import { Invoice } from '../../entities/invoice.entity';
import { InvoiceLineItem } from '../../entities/invoice-line-item.entity';
import { InvoiceDiscountCalculator } from '../calculations/invoice-discount.calculator';
import { RoundingUtils } from '../../../utils/rounding.utils';
import { UpdateLineItemRequestDto, UpdateLineItemResponseDto } from '../../dto/update-invoice-line-item-request.dto';
import { InvoiceType } from '../../enums/invoice-type.enum';
import { ItemTypeEnum } from '../../enums/item-type.enum';

@Injectable()
export class InvoiceLineItemUpdateTransformationService {
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
     * Full line item update calculation pipeline.
     * Matches legacy InvoiceLineItem::beforeSave + afterSave → Invoice::beforeSave cascade.
     *
     * Runs all calculations in sequence and returns:
     *   - updateFields: fields to save on the line item
     *   - Invoice cascade totals: subTotal, tax, total, balance, status
     *   - validationError: if validation fails, contains the error message
     */
    transformLineItemCalculation(
        lineItem: InvoiceLineItem,
        requestDto: UpdateLineItemRequestDto,
        taxData: { taxTypeName: string; taxCodeRate: number } | null,
        allLineItemsWithDiscounts: InvoiceLineItem[],
        invoice: Invoice,
        lineItemTaxSum: number,
        paidAmount: number,
        isReversed: boolean,
    ): {
        updateFields: Partial<InvoiceLineItem>;
        newSubTotal: number;
        newTax: number;
        newTotal: number;
        newBalance: number;
        newStatus: number;
        validationError: string | null;
    } {
        // Step 1: Scenario-based validation
        const isOpeningBalanceOrLessonCredit =
            lineItem.itemTypeId === ItemTypeEnum.TYPE_OPENING_BALANCE ||
            lineItem.itemTypeId === ItemTypeEnum.TYPE_LESSON_CREDIT;
        const isMisc = lineItem.itemTypeId === ItemTypeEnum.TYPE_MISC;
        const allowNegativeAmount = isReversed || isOpeningBalanceOrLessonCredit || isMisc;

        if (!allowNegativeAmount && requestDto.amount <= 0) {
            return this.errorResult('Amount must be greater than 0.');
        }

        if (isMisc && (!requestDto.description || requestDto.description.trim().length === 0)) {
            return this.errorResult('Description is required for miscellaneous items.');
        }

        // Step 2: Build update fields from request
        const updateFields: Partial<InvoiceLineItem> = {
            description: requestDto.description.trim(),
            amount: requestDto.amount,
            unit: requestDto.unit,
        };

        if (requestDto.cost !== undefined) {
            updateFields.cost = requestDto.cost;
        }

        if (requestDto.royaltyFree !== undefined) {
            updateFields.royaltyFree = requestDto.royaltyFree;
        }

        // Step 3: Calculate net price for the edited line item
        const lineItemForCalc = { ...lineItem, ...updateFields } as InvoiceLineItem;

        // Copy discounts from the already-loaded line items
        const currentItemWithDiscounts = allLineItemsWithDiscounts.find(
            (li) => li.id === lineItem.id,
        );
        if (currentItemWithDiscounts) {
            lineItemForCalc.discounts = currentItemWithDiscounts.discounts;
        }

        const netPrice = this.calculateNetPrice(lineItemForCalc, invoice);

        // Step 4: Tax recalculation (matching legacy InvoiceLineItem::beforeSave)
        if (taxData) {
            updateFields.taxType = taxData.taxTypeName;
            updateFields.taxRate = netPrice * taxData.taxCodeRate / 100.0;
        }
        updateFields.netTotal = netPrice;

        // Step 5: Invoice cascade — recalculate subTotal from all line items
        let newSubTotal = 0;
        for (const li of allLineItemsWithDiscounts) {
            if (li.id === lineItem.id) {
                newSubTotal += netPrice;
            } else {
                newSubTotal += this.calculateNetPrice(li, invoice);
            }
        }

        // Step 6: Calculate tax (preserve manual tax adjustment if set)
        // lineItemTaxSum is fetched before persisting this line-item update, so adjust it
        // with this item's old/new tax to avoid tax being applied only on second save.
        const previousTaxRate = parseFloat(String(lineItem.taxRate)) || 0;
        const updatedTaxRate =
            updateFields.taxRate !== undefined
                ? parseFloat(String(updateFields.taxRate)) || 0
                : previousTaxRate;
        const recalculatedLineItemTaxSum = RoundingUtils.roundHalfUp(
            lineItemTaxSum - previousTaxRate + updatedTaxRate,
            4,
        );

        const newTax = invoice.isTaxAdjusted
            ? parseFloat(String(invoice.tax)) || 0
            : recalculatedLineItemTaxSum;

        // Step 7: Calculate total, balance, status
        const newTotal = newSubTotal + newTax;

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

        // For pro-forma invoices, status calculation differs
        if (invoice.type !== InvoiceType.INVOICE) {
            if (roundedPaid >= roundedTotal) {
                newStatus = Invoice.STATUS_PAID;
            } else {
                newStatus = Invoice.STATUS_OWING;
            }
        }

        const newBalance = roundedPaid === roundedTotal
            ? 0
            : roundedTotal - roundedPaid;

        return {
            updateFields,
            newSubTotal,
            newTax,
            newTotal,
            newBalance,
            newStatus,
            validationError: null,
        };
    }

    /**
     * Helper to create an error result from transformLineItemCalculation
     */
    private errorResult(message: string) {
        return {
            updateFields: {} as Partial<InvoiceLineItem>,
            newSubTotal: 0,
            newTax: 0,
            newTotal: 0,
            newBalance: 0,
            newStatus: 0,
            validationError: message,
        };
    }

    /**
     * Transform into the update line item response DTO.
     * Response body contains only id.
     */
    transformUpdateLineItemResponse(
        lineItemId: number,
    ): UpdateLineItemResponseDto {
        return {
            id: lineItemId,
        } as UpdateLineItemResponseDto;
    }
}
