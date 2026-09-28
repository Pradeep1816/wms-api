import { Injectable } from '@nestjs/common';
import { InvoiceLineItem } from '../../entities/invoice-line-item.entity';
import { InvoiceLineItemDiscount } from '../../entities/invoice-line-item-discount.entity';
import { Invoice } from '../../entities/invoice.entity';
import { RoundingUtils } from '../../../utils/rounding.utils';
import { ItemTypeEnum } from '../../enums/item-type.enum';

/**
 * Calculator for invoice line item discounts
 * Implements 5-step cascading discount logic from legacy system
 */
@Injectable()
export class InvoiceDiscountCalculator {
  /**
   * Calculate total discounts for all line items in an invoice
   * @param lineItems - Array of invoice line items with discounts loaded
   * @param invoice - Invoice entity
   * @returns Total discount amount
   */
  calculateTotalDiscounts(lineItems: InvoiceLineItem[], invoice: Invoice): number {
    let totalDiscount = 0;

    if (!lineItems || lineItems.length === 0) {
      return 0;
    }

    for (const lineItem of lineItems) {
      const storedNetTotal = Number(lineItem.netTotal);
      const hasStoredNetTotal =
        lineItem.netTotal !== null &&
        lineItem.netTotal !== undefined &&
        Number.isFinite(storedNetTotal);
      const isPrivateLesson =
        Number(lineItem.itemTypeId) === ItemTypeEnum.TYPE_PRIVATE_LESSON;
      // Private-lesson totals must agree with the persisted line-item amount.
      // Exploded discount rows may recalculate one cent differently.
      const lineItemDiscount = isPrivateLesson && hasStoredNetTotal
        ? this.getGrossPrice(lineItem) - storedNetTotal
        : this.calculateLineItemDiscount(lineItem, invoice);
      totalDiscount += lineItemDiscount;
    }

    return RoundingUtils.roundHalfUp(totalDiscount, 2);
  }

  /**
   * Calculate discount for a single line item using cascade logic
   * Discount cascade order (CRITICAL):
   * 1. Multi-enrolment (type=3, flat dollar)
   * 2. Line-item (type=4, percentage or flat)
   * 3. Group (type=5, percentage or flat)
   * 4. Customer (type=1, percentage, skip if equipment rental)
   * 5. Payment frequency (type=2, percentage)
   * 
   * @param lineItem - Invoice line item with discounts relation loaded
   * @param invoice - Invoice entity
   * @returns Total discount for this line item
   */
  calculateLineItemDiscount(lineItem: InvoiceLineItem, invoice: Invoice): number {
    const grossPrice = this.getGrossPrice(lineItem);
    let totalDiscount = 0;
    let remainingPrice = grossPrice;

    // Get discounts by type - check both possible relation names
    const discounts = (lineItem.discounts as any) || (lineItem.itemDiscounts as any) || [];
    
    // Filter out null/undefined discounts
    const validDiscounts = Array.isArray(discounts) ? discounts.filter(d => d) : [];
    
    // Helper to compare discount type (handle both string and number)
    const matchesType = (discount: any, typeValue: number): boolean => {
      return Number(discount.type) === typeValue;
    };
    
    const multiEnrolmentDiscount = validDiscounts.find(
      (d) => matchesType(d, InvoiceLineItemDiscount.TYPE_MULTIPLE_ENROLMENT),
    );
    const lineItemDiscount = validDiscounts.find(
      (d) => matchesType(d, InvoiceLineItemDiscount.TYPE_LINE_ITEM),
    );
    const groupDiscount = validDiscounts.find(
      (d) => matchesType(d, InvoiceLineItemDiscount.TYPE_GROUP),
    );
    const customerDiscount = validDiscounts.find(
      (d) => matchesType(d, InvoiceLineItemDiscount.TYPE_CUSTOMER),
    );
    const prepaidDiscount = validDiscounts.find(
      (d) => matchesType(d, InvoiceLineItemDiscount.TYPE_PREPAID_CYCLE),
    );
    // Suppressed while prepaid is present - both express the same entitlement
    // to a cheaper cycle, so applying both discounts the line twice.
    const paymentFrequencyDiscount = prepaidDiscount
      ? undefined
      : validDiscounts.find(
          (d) => matchesType(d, InvoiceLineItemDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY),
        );

    // Step 1: Multi-enrolment discount (always flat dollar)
    if (multiEnrolmentDiscount) {
      const discountValue = Number(multiEnrolmentDiscount.value);
      const discount = grossPrice < 0 ? -discountValue : discountValue;
      totalDiscount += discount;
      remainingPrice = grossPrice - totalDiscount;
    }

    // Step 2: Line-item discount (percentage or flat)
    if (lineItemDiscount) {
      const discount = this.applyDiscount(
        remainingPrice,
        Number(lineItemDiscount.value),
        Number(lineItemDiscount.valueType),
      );
      totalDiscount += discount;
      remainingPrice = grossPrice - RoundingUtils.roundHalfUp(totalDiscount, 2);
    }

    // Step 3: Group discount (percentage or flat)
    if (groupDiscount) {
      const discount = this.applyDiscount(
        remainingPrice,
        Number(groupDiscount.value),
        Number(groupDiscount.valueType),
      );
      totalDiscount += discount;
      remainingPrice = grossPrice - RoundingUtils.roundHalfUp(totalDiscount, 2);
    }

    // Step 4: Customer discount (always percentage, SKIP for equipment rental)
    if (customerDiscount && !invoice.isEquipmentRentalContract) {
      const discount = this.applyDiscount(
        remainingPrice,
        Number(customerDiscount.value),
        Number(customerDiscount.valueType),
      );
      totalDiscount += discount;
      remainingPrice = grossPrice - RoundingUtils.roundHalfUp(totalDiscount, 2);
    }

    // Step 5: Prepaid cycle (always dollars, and replaces payment frequency)
    if (prepaidDiscount) {
      const discountValue = Number(prepaidDiscount.value);
      totalDiscount += remainingPrice < 0 ? 0 : discountValue;
      return totalDiscount;
    }

    // Step 6: Payment frequency discount (always percentage)
    if (paymentFrequencyDiscount) {
      const discount = this.applyDiscount(
        remainingPrice,
        Number(paymentFrequencyDiscount.value),
        Number(paymentFrequencyDiscount.valueType),
      );
      totalDiscount += discount;
    }

    return totalDiscount;
  }

  /**
   * Apply a discount to a price
   * @param price - Current price
   * @param discountValue - Discount value (percentage or flat)
   * @param valueType - 0=flat dollar, 1=percentage
   * @returns Discount amount
   */
  private applyDiscount(
    price: number,
    discountValue: number,
    valueType: number,
  ): number {
    // Handle both string and number valueType
    const type = Number(valueType);
    
    if (type === InvoiceLineItemDiscount.VALUE_TYPE_PERCENTAGE) {
      // Percentage discount
      return (Number(discountValue) / 100) * price;
    } else {
      // Flat dollar discount
      return price < 0 ? -(Number(discountValue)) : Number(discountValue);
    }
  }

  /**
   * Calculate gross price for a line item
   * For group lessons: grossPrice = amount
   * For all other types: grossPrice = amount × unit
   * 
   * @param lineItem - Invoice line item
   * @returns Gross price
   */
  private getGrossPrice(lineItem: InvoiceLineItem): number {
    const isGroupLesson = lineItem.itemTypeId === 2; // TYPE_GROUP_LESSON = 2

    if (isGroupLesson) {
      return RoundingUtils.roundHalfUp(lineItem.amount, 2);
    } else {
      return RoundingUtils.roundHalfUp(lineItem.amount * lineItem.unit, 2);
    }
  }
}
