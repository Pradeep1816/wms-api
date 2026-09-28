import { Injectable, NotFoundException } from '@nestjs/common';
import { InvoicePrintRepository } from '../repositories/invoice-print.repository';
import { InvoicePrintTransformationService } from './transformations/invoice-print-transformation.service';
import { InvoicePrintResponseDto } from '../dto/invoice-print-response.dto';
import { ItemTypeEnum } from '../enums/item-type.enum';
import { RoundingUtils } from '../../utils/rounding.utils';

/**
 * Service for Invoice Print operations
 * Contains business logic for preparing invoice print data
 * 
 * Responsibilities:
 * - Orchestrate data fetching from repository
 * - Calculate totals and apply business rules
 * - Delegate transformation to InvoicePrintTransformationService
 */
@Injectable()
export class InvoicePrintService {
  constructor(
    private readonly invoicePrintRepository: InvoicePrintRepository,
    private readonly transformationService: InvoicePrintTransformationService,
  ) {}

  /**
   * Get all invoice data needed for printing
   * Mirrors legacy PrintController::actionInvoice()
   * 
   * Flow:
   * 1. Fetch invoice and validate it exists
   * 2. Fetch related data in parallel (location, customer, line items, payments, notes)
   * 3. Calculate totals (sum of discounts, paid amount)
   * 4. Transform to DTO using transformation service
   */
  async getInvoicePrintData(
    locationId: number,
    locationSlug: string,
    invoiceId: number,
  ): Promise<InvoicePrintResponseDto> {
    // 1. Fetch invoice and validate
    const invoice = await this.invoicePrintRepository.findInvoiceById(
      locationId,
      invoiceId,
    );

    if (!invoice) {
      throw new NotFoundException(
        `Invoice with ID ${invoiceId} not found in location ${locationSlug}`,
      );
    }

    // 2. Fetch related data in parallel for efficiency
    const [
      locationData,
      customerData,
      lineItems,
      payments,
      reminderNotes,
    ] = await Promise.all([
      this.invoicePrintRepository.getLocationData(locationId),
      invoice.userId
        ? this.invoicePrintRepository.getCustomerData(invoice.userId)
        : Promise.resolve(null),
      this.invoicePrintRepository.getLineItems(invoiceId),
      this.invoicePrintRepository.getPayments(invoiceId, invoice.type),
      this.invoicePrintRepository.getReminderNotes(),
    ]);

    if (invoice.walkinBuyerName && customerData) customerData.name = `${invoice.walkinBuyerName} (Walk-in Customer)`;

    // 3. Calculate totals with business logic
    const totals = await this.calculateTotals(lineItems, invoice.id);

    // 4. Transform to response DTO using transformation service
    return this.transformationService.transformToResponse(
      invoice,
      locationData,
      customerData,
      lineItems,
      payments,
      totals,
      reminderNotes,
    );
  }

  /**
   * Calculate invoice totals with business rules
   * 
   * Business Rules:
   * - Sum all discounts from line items
   * - Get total paid amount from payments
   * 
   * @param lineItems - Invoice line items
   * @param invoiceId - Invoice ID
   * @returns Object with discount total and paid amount
   */
  private async calculateTotals(
    lineItems: any[],
    invoiceId: number,
  ): Promise<{ discount: number; paid: number }> {
    // Calculate total discount from all line items
    let totalDiscount = 0;
    for (const item of lineItems) {
      const storedNetTotal = Number(item.netTotal);
      const hasStoredNetTotal =
        item.netTotal !== null &&
        item.netTotal !== undefined &&
        Number.isFinite(storedNetTotal);
      const isPrivateLesson =
        Number(item.itemTypeId) === ItemTypeEnum.TYPE_PRIVATE_LESSON;
      let itemDiscount: number;

      if ((isPrivateLesson || item.isPos) && hasStoredNetTotal) {
        const grossPrice = RoundingUtils.roundDecimal(
          Number(item.amount ?? 0) * Number(item.unit ?? 0),
          2,
        );
        itemDiscount = grossPrice - storedNetTotal;
      } else {
        itemDiscount = await this.invoicePrintRepository.getLineItemDiscountTotal(
          item.id,
        );
      }
      totalDiscount += itemDiscount;
    }

    // Get total paid amount
    const paid = await this.invoicePrintRepository.getInvoicePaidAmount(invoiceId);

    return {
      discount: RoundingUtils.roundDecimal(totalDiscount, 2),
      paid,
    };
  }
}
