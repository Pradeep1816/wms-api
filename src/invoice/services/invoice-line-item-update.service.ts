import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InvoiceLineItemUpdateRepository } from '../repositories/invoice-line-item-update.repository';
import { InvoiceLineItemUpdateTransformationService } from './transformations/invoice-line-item-update-transformation.service';
import { UpdateLineItemRequestDto, UpdateLineItemResponseDto } from '../dto/update-invoice-line-item-request.dto';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';
import { InvoicePosLinesService } from './invoice-pos-lines.service';

@Injectable()
export class InvoiceLineItemUpdateService {
    constructor(
        private readonly lineItemUpdateRepository: InvoiceLineItemUpdateRepository,
        private readonly transformationService: InvoiceLineItemUpdateTransformationService,
        private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
        private readonly posLines: InvoicePosLinesService,
    ) { }

    /**
     * Update an invoice line item.
     * Matches legacy InvoiceLineItemController::actionUpdate()
     * with InvoiceLineItem::beforeSave/afterSave cascade to Invoice::beforeSave/afterSave.
     *
     * Flow:
     *   1. Find line item by ID (location-scoped)
     *   2. Guard: invoice must not be posted, not payment credit
     *   3. Fetch all data needed for calculations
     *   4. Transform and calculate all values
     *   5. Save line item
     *   6. Save invoice totals
     *   7. Return success response
     */
    async updateLineItem(
        locationId: number,
        locationSlug: string,
        lineItemId: number,
        requestDto: UpdateLineItemRequestDto,
        userId: number,
    ): Promise<UpdateLineItemResponseDto> {
        try {
            // Step 1: Find line item with invoice (location-scoped)
            const lineItem = await this.lineItemUpdateRepository.findLineItemById(
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
                return this.posLines.change(locationId, locationSlug, lineItemId, requestDto, userId);
            }

            // Step 2: Guard checks (matching legacy actionUpdate guards)
            if (invoice.isPosted) {
                throw new BadRequestException(
                    'Item cannot be updated. Invoice is posted.',
                );
            }

            const firstLineItem = await this.lineItemUpdateRepository.getFirstLineItem(invoice.id);
            if (firstLineItem && firstLineItem.itemTypeId === 10) {
                throw new BadRequestException(
                    'Item cannot be updated. Payment credit invoices are not editable.',
                );
            }

            // Step 3: Fetch all data needed for calculations
            const isReversed = await this.lineItemUpdateRepository.isReversedInvoice(invoice.id);
            const taxData = await this.lineItemUpdateRepository.lookupTaxData(lineItem.taxStatus);
            const allLineItemsWithDiscounts = await this.lineItemUpdateRepository.getLineItemsWithDiscounts(invoice.id);
            const lineItemTaxSum = await this.lineItemUpdateRepository.getLineItemTaxSum(invoice.id);
            const paidAmount = await this.lineItemUpdateRepository.getInvoicePaidAmount(invoice.id);

            // Step 4: Transform and calculate all values
            const { updateFields, newSubTotal, newTax, newTotal, newBalance, newStatus, validationError } =
                this.transformationService.transformLineItemCalculation(
                    lineItem,
                    requestDto,
                    taxData,
                    allLineItemsWithDiscounts,
                    invoice,
                    lineItemTaxSum,
                    paidAmount,
                    isReversed,
                );

            if (validationError) {
                throw new BadRequestException(validationError);
            }

            if (requestDto.royaltyFree !== undefined) {
                const royaltySnapshot = await this.lineItemUpdateRepository.getRoyaltySnapshot(
                    locationId,
                    lineItem.itemId,
                    requestDto.royaltyFree,
                );
                updateFields.royaltyCategoryId = royaltySnapshot.categoryId || null;
                updateFields.royaltyRateApplied = royaltySnapshot.rate;
                updateFields.advertisementRateApplied = royaltySnapshot.advertisementRate;
            }

            // Step 5: Save line item
            await this.lineItemUpdateRepository.updateLineItem(
                lineItem.id,
                updateFields,
            );

            // Step 6: Save invoice totals
            await this.lineItemUpdateRepository.updateInvoiceTotals(
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

            // Step 7: Return response DTO
            return this.transformationService.transformUpdateLineItemResponse(
                lineItem.id,
            );
        } catch (error) {
            console.error('Error in updateLineItem service:', error);

            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }

            throw new BadRequestException(
                `Failed to update line item: ${error.message}`,
            );
        }
    }
}
