import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InvoiceLineItemDeleteRepository } from '../repositories/invoice-line-item-delete.repository';
import { InvoiceLineItemDeleteTransformationService } from './transformations/invoice-line-item-delete-transformation.service';
import { DeleteLineItemResponseDto } from '../dto/delete-invoice-line-item-request.dto';
import { InvoiceType } from '../enums/invoice-type.enum';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';
import { InvoicePosLinesService } from './invoice-pos-lines.service';

@Injectable()
export class InvoiceLineItemDeleteService {
    constructor(
        private readonly invoiceLineItemDeleteRepository: InvoiceLineItemDeleteRepository,
        private readonly transformationService: InvoiceLineItemDeleteTransformationService,
        private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
        private readonly posLines: InvoicePosLinesService,
    ) { }

    /**
     * Delete (soft) an invoice line item.
     * Matches legacy InvoiceLineItemController::actionDelete()
     * with afterSoftDelete → Invoice::beforeSave() cascade.
     *
     * Flow:
     *   1. Find line item by ID (location-scoped)
     *   2. Guard: invoice must not be posted
     *   3. Soft delete: set isDeleted = true
     *   4. Recalculate invoice totals from remaining line items
     *   5. Save updated invoice totals
     *   6. Return success response
     */
    async deleteLineItem(
        locationId: number,
        locationSlug: string,
        lineItemId: number,
        userId: number,
    ): Promise<DeleteLineItemResponseDto> {
        try {
            // Step 1: Find line item with invoice (location-scoped)
            const lineItem = await this.invoiceLineItemDeleteRepository.findLineItemById(
                locationId,
                lineItemId,
            );

            if (!lineItem) {
                throw new NotFoundException(
                    `Line item with ID ${lineItemId} not found in location ${locationSlug}`,
                );
            }

            const invoice = lineItem.invoice;
            if (lineItem.isPos || await this.posLines.hasPos(invoice.id)) {
                await this.posLines.change(locationId, locationSlug, lineItemId, null, userId);
                return this.transformationService.transformDeleteLineItemResponse(lineItemId);
            }

            // Step 2: Guard — only check isPosted (matches legacy exactly)
            if (invoice.isPosted) {
                throw new BadRequestException(
                    'Line Item cannot be deleted if invoice is posted.',
                );
            }

            // Step 3: Soft delete the line item (set isDeleted = true)
            await this.invoiceLineItemDeleteRepository.softDeleteLineItem(lineItem);

            // Step 4: Fetch remaining line items
            const remainingLineItems = await this.invoiceLineItemDeleteRepository.getLineItemsWithDiscounts(invoice.id);

            // Step 4a: Auto-delete empty pro-forma invoice
            //  
            if (remainingLineItems.length === 0 && invoice.type !== InvoiceType.INVOICE) {
                await this.invoiceLineItemDeleteRepository.softDeleteInvoice(invoice);
                return this.transformationService.transformDeleteLineItemResponse(lineItemId);
            }

            // Step 5: Fetch remaining data for invoice recalculation
            const lineItemTaxSum = await this.invoiceLineItemDeleteRepository.getLineItemTaxSum(invoice.id);
            const paidAmount = await this.invoiceLineItemDeleteRepository.getInvoicePaidAmount(invoice.id);

            // Step 6: Transform — recalculate invoice totals
            const { newSubTotal, newTax, newTotal, newBalance, newStatus } =
                this.transformationService.transformDeleteTotals(
                    remainingLineItems,
                    invoice,
                    lineItemTaxSum,
                    paidAmount,
                );

            // Step 7: Save updated invoice totals
            await this.invoiceLineItemDeleteRepository.updateInvoiceTotals(
                invoice,
                newSubTotal,
                newTax,
                newTotal,
                newBalance,
                newStatus,
                userId,
            );

            // Match legacy Invoice::afterSave -> User::updateCustomerBalance.
            await this.customerBalanceRecalculatorService.recalculateAndPersist(invoice.userId, {
                locationSlug,
                updatedByUserId: userId,
            });

            // Step 8: Return response DTO
            return this.transformationService.transformDeleteLineItemResponse(lineItemId);
        } catch (error) {
            console.error('Error in deleteLineItem service:', error);

            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }

            throw new BadRequestException(
                `Failed to delete line item: ${error.message}`,
            );
        }
    }
}
