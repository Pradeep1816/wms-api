import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { InvoiceLineItem } from '../../entities/invoice-line-item.entity';
import { InvoiceLineItemDiscount } from '../../entities/invoice-line-item-discount.entity';
import {InvoiceItemsResponse,InvoiceLineItemInfo,InvoiceLineItemBasicInfo,} from '../../dto/invoice-items-response.dto';
import { formatCurrency } from '../../../utils/formatters';
import { ItemTypeEnum } from '../../enums/item-type.enum';
import { RoundingUtils } from '../../../utils/rounding.utils';

@Injectable()
export class InvoiceItemsTransformationService {
  /**
   * Transform line items to response DTO
   */
  transformToResponse(
    lineItems: InvoiceLineItem[],
    discountsByLineItem: Map<number, InvoiceLineItemDiscount[]>,
    isEquipmentRental: boolean,
    showAllFields: boolean = false,
  ): InvoiceItemsResponse {
    const items = lineItems.map((li) =>
      this.transformLineItem(
        li,
        discountsByLineItem.get(li.id) || [],
        isEquipmentRental,
        showAllFields,
      ),
    );

    const responseData = {
      body: {
        lineItems: items,
      },
    };

    return plainToInstance(InvoiceItemsResponse, responseData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform single line item to DTO
   */
  private transformLineItem(
    lineItem: InvoiceLineItem,
    discounts: InvoiceLineItemDiscount[],
    isEquipmentRental: boolean,
    showAllFields: boolean,
  ): InvoiceLineItemInfo | InvoiceLineItemBasicInfo {
    const isGroup = Number(lineItem.itemTypeId) === ItemTypeEnum.TYPE_GROUP_LESSON;
    const grossPrice = this.calculateGrossPrice(lineItem, isGroup);
    const calculatedDiscount = this.calculateDiscount(
      grossPrice,
      discounts,
      isEquipmentRental,
    );
    const calculatedNetPrice = this.round(grossPrice - calculatedDiscount);
    const storedNetTotal = Number(lineItem.netTotal);
    const hasStoredNetTotal =
      lineItem.netTotal !== null &&
      lineItem.netTotal !== undefined &&
      Number.isFinite(storedNetTotal);
    const useStoredPrivateLessonTotal =
      (lineItem.isPos || Number(lineItem.itemTypeId) === ItemTypeEnum.TYPE_PRIVATE_LESSON) &&
      hasStoredNetTotal;
    // Persisted netTotal is the private-lesson invoice source of truth.
    // Recomputing it can undo the cent remainder assigned by lesson explode.
    const netPrice = useStoredPrivateLessonTotal
      ? this.round(storedNetTotal)
      : calculatedNetPrice;
    const discount = useStoredPrivateLessonTotal
      ? this.round(grossPrice - netPrice)
      : calculatedDiscount;

    if (!showAllFields) {
      return this.transformToBasicInfo(lineItem, netPrice);
    }

    return this.transformToFullInfo(lineItem, discount, netPrice);
  }

  /**
   * Transform to basic info (enable=false)
   */
  private transformToBasicInfo(
    lineItem: InvoiceLineItem,
    netPrice: number,
  ): InvoiceLineItemBasicInfo {
    const dtoData = {
      id: lineItem.id,
      isPos: Boolean(lineItem.isPos),
      returnedQuantity: Number(lineItem.returnedQuantity || 0),
      canReturn: Boolean(lineItem.isPos && !lineItem.returnedFromLineItemId && Number(lineItem.unit) > Number(lineItem.returnedQuantity || 0)),
      code: lineItem.code || '',
      description: lineItem.description || '',
      qty: Number(lineItem.unit) || 0,
      cost: formatCurrency(this.round(Number(lineItem.cost) || 0)),
      price: formatCurrency(netPrice),
    };

    return plainToInstance(InvoiceLineItemBasicInfo, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform to full info (enable=true)
   */
  private transformToFullInfo(
    lineItem: InvoiceLineItem,
    discount: number,
    netPrice: number,
  ): InvoiceLineItemInfo {
    const dtoData = {
      id: lineItem.id,
      isPos: Boolean(lineItem.isPos),
      returnedQuantity: Number(lineItem.returnedQuantity || 0),
      canReturn: Boolean(lineItem.isPos && !lineItem.returnedFromLineItemId && Number(lineItem.unit) > Number(lineItem.returnedQuantity || 0)),
      code: lineItem.code || '',
      royaltyFree: lineItem.royaltyFree ? 'Yes' : 'No',
      description: lineItem.description || '',
      qty: Number(lineItem.unit) || 0,
      discount: formatCurrency(this.round(discount)),
      taxStatus: lineItem.taxStatus || '',
      tax: formatCurrency(this.round(Number(lineItem.taxRate) || 0)),
      unitPrice: formatCurrency(this.round(Number(lineItem.amount) || 0)),
      cost: formatCurrency(this.round(Number(lineItem.cost) || 0)),
      price: formatCurrency(netPrice),
    };

    return plainToInstance(InvoiceLineItemInfo, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Calculate gross price for a line item
   */
  private calculateGrossPrice(lineItem: InvoiceLineItem, isGroup: boolean): number {
    const amount = Number(lineItem.amount) || 0;
    const unit = Number(lineItem.unit) || 0;
    return isGroup ? this.round(amount) : this.round(amount * unit);
  }

  /**
   * Calculate total discount for a line item
   * Applies discounts in order: multi-enrolment → line item → group → customer → payment frequency
   */
  private calculateDiscount(
    grossPrice: number,
    discounts: InvoiceLineItemDiscount[],
    isEquipmentRental: boolean,
  ): number {
    const getDiscountByType = (type: number) =>
      discounts.find((d) => d.type === type) || null;

    let discount = 0.0;
    let lineItemPrice = grossPrice;

    // 1. Multi-enrolment discount (dollar)
    const multiEnrolment = getDiscountByType(InvoiceLineItemDiscount.TYPE_MULTIPLE_ENROLMENT);
    if (multiEnrolment) {
      const val = Number(multiEnrolment.value) || 0;
      discount += lineItemPrice < 0 ? -val : val;
      lineItemPrice = grossPrice - discount;
    }

    // 2. Line item discount (% or $)
    const lineItemDisc = getDiscountByType(InvoiceLineItemDiscount.TYPE_LINE_ITEM);
    if (lineItemDisc) {
      const val = Number(lineItemDisc.value) || 0;
      if (Number(lineItemDisc.valueType)) {
        discount += (val / 100) * lineItemPrice;
      } else {
        discount += lineItemPrice < 0 ? -val : val;
      }
      lineItemPrice = grossPrice - this.round(discount);
    }

    // 3. Group discount (% or $)
    const groupDisc = getDiscountByType(InvoiceLineItemDiscount.TYPE_GROUP);
    if (groupDisc) {
      const val = Number(groupDisc.value) || 0;
      if (Number(groupDisc.valueType)) {
        discount += (val / 100) * lineItemPrice;
      } else {
        discount += lineItemPrice < 0 ? -val : val;
      }
      lineItemPrice = grossPrice - this.round(discount);
    }

    // 4. Customer discount (always %, skipped for equipment rental)
    if (!isEquipmentRental) {
      const customerDisc = getDiscountByType(InvoiceLineItemDiscount.TYPE_CUSTOMER);
      if (customerDisc) {
        const val = Number(customerDisc.value) || 0;
        discount += (val / 100) * lineItemPrice;
        lineItemPrice = grossPrice - this.round(discount);
      }
    }

    // 5. Prepaid cycle (always $, and replaces payment frequency)
    //
    // This is what the customer sees. The invoice aggregates every discount into
    // one figure, so getting this wrong does not show up as a wrong label - it
    // shows up as a wrong total, which is the harder kind to notice. It must
    // agree with `invoice-discount.calculator`, which is a separate
    // implementation of this same cascade.
    const prepaidDisc = getDiscountByType(
      InvoiceLineItemDiscount.TYPE_PREPAID_CYCLE,
    );
    if (prepaidDisc) {
      const val = Number(prepaidDisc.value) || 0;
      discount += lineItemPrice < 0 ? -val : val;
      return discount;
    }

    // 6. Enrolment payment frequency discount (always %)
    const freqDisc = getDiscountByType(InvoiceLineItemDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY);
    if (freqDisc) {
      const val = Number(freqDisc.value) || 0;
      discount += (val / 100) * lineItemPrice;
    }

    return discount;
  }

  /**
   * Round to 2 decimal places
   */
  private round(value: number): number {
    return RoundingUtils.roundDecimal(value || 0, 2);
  }
}
