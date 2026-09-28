import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InvoiceLineItemCreateRepository } from '../repositories/invoice-line-item-create.repository';
import { CreateLineItemRequestDto, CreateLineItemResponseDto } from '../dto/create-invoice-line-item-request.dto';
import { ItemTypeEnum } from '../enums/item-type.enum';
import { InvoiceLineItemCreateTransformationService } from './transformations/invoice-line-item-create-transformation.service';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';
import { InvoicePosLinesService } from './invoice-pos-lines.service';
import { isPOSFeatureEnabled } from '../../shared/helpers/pos-rollout.helper';

@Injectable()
export class InvoiceLineItemCreateService {
    constructor(
        private readonly lineItemCreateRepository: InvoiceLineItemCreateRepository,
        private readonly transformationService: InvoiceLineItemCreateTransformationService,
        private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
        private readonly posLines: InvoicePosLinesService,
    ) { }

    /**
     * Add a misc line item to an invoice.
     * Matches legacy InvoiceController::actionAddMisc + Item::addToInvoice
     * with InvoiceLineItem::beforeSave + afterSave cascade.
     *
     * Flow (following update/delete pattern):
     *   1. Find invoice by ID (location-scoped)
     *   2. Find item (catalog) by ID
     *   3. Guard: invoice must not be posted
     *   4. Duplicate check: if item already on invoice → increment unit
     *   5. If new: lookup tax data, build line item, save
     *   6. Customer discount: auto-apply if applicable
     *   7. Recalculate invoice totals
     *   8. Return success response
     */
    async createLineItem(
        locationId: number,
        locationSlug: string,
        invoiceId: number,
        requestDto: CreateLineItemRequestDto,
        userId: number,
    ): Promise<CreateLineItemResponseDto> {
        try {
            // Step 1: Find invoice (location-scoped)
            const invoice = await this.lineItemCreateRepository.findInvoiceById(
                locationId,
                invoiceId,
            );

            if (!invoice) {
                throw new NotFoundException(
                    `Invoice with ID ${invoiceId} not found in location ${locationSlug}`,
                );
            }

            // Step 2: Find item (catalog)
            const item = await this.lineItemCreateRepository.findItemById(requestDto.itemId);

            if (!item) {
                throw new NotFoundException(
                    `Item with ID ${requestDto.itemId} not found`,
                );
            }

            // Step 3: Guard checks (matching update/delete pattern)
            if (isPOSFeatureEnabled(locationSlug) && this.posLines.isCatalogPurchase(item, locationId)) {
                return this.posLines.add(locationId, locationSlug, invoiceId, item.id, requestDto.quantity ?? 1, userId);
            }

            if (invoice.isPosted) {
                throw new BadRequestException(
                    'Line item cannot be added. Invoice is posted.',
                );
            }

            // Step 4: Duplicate check — if item already exists on invoice, increment unit
            // Matches legacy: foreach ($invoice->lineItems ...) { $lineItem->unit += 1; }
            const existingLineItem = await this.lineItemCreateRepository.findExistingLineItem(
                invoiceId,
                requestDto.itemId,
            );

            let savedLineItem;

            if (existingLineItem) {
                // UPDATE PATH: increment unit by 1
                existingLineItem.unit = Number(existingLineItem.unit) + 1;

                // Recalculate tax and netTotal using any loaded discounts.
                const taxData = await this.lineItemCreateRepository.getTaxDataForItem(item.taxStatusId);
                if (taxData) {
                    this.transformationService.refreshLineItemPricing(
                        existingLineItem,
                        invoice,
                        taxData.taxCodeRate,
                    );
                }

                savedLineItem = await this.lineItemCreateRepository.saveLineItem(existingLineItem);
            } else {
                // INSERT PATH: create new line item
                // Step 5a: Lookup tax data via 5-table chain
                const taxData = await this.lineItemCreateRepository.getTaxDataForItem(item.taxStatusId);

                if (!taxData) {
                    throw new BadRequestException(
                        `Tax data not found for item ${requestDto.itemId} (taxStatusId: ${item.taxStatusId})`,
                    );
                }

                // Step 5b: Build the line item via transformation service
                const royaltySnapshot = await this.lineItemCreateRepository.getRoyaltySnapshot(
                    locationId,
                    item,
                );
                const newLineItem = this.transformationService.buildNewLineItem(
                    invoice,
                    item,
                    taxData,
                    royaltySnapshot,
                );

                // Step 5c: Save the new line item
                savedLineItem = await this.lineItemCreateRepository.saveLineItem(newLineItem);

                // Step 6: Auto-apply customer discount (only for NEW items)
                // Conditions: user has discount, not reversed invoice, not opening balance, not group lesson
                if (invoice.user) {
                    const isReversedInvoice = await this.lineItemCreateRepository.isReversedInvoice(
                        invoice.id,
                    );
                    const customerDiscount = await this.lineItemCreateRepository.getCustomerDiscount(
                        invoice.userId,
                    );

                    if (
                        customerDiscount &&
                        customerDiscount.value !== null &&
                        customerDiscount.value !== undefined
                    ) {
                        const isOpeningBalance = savedLineItem.itemTypeId === ItemTypeEnum.TYPE_OPENING_BALANCE;
                        const isGroupLesson = savedLineItem.itemTypeId === ItemTypeEnum.TYPE_GROUP_LESSON;

                        if (!isReversedInvoice && !isOpeningBalance && !isGroupLesson) {
                            const createdDiscount = await this.lineItemCreateRepository.createCustomerDiscount(
                                savedLineItem.id,
                                customerDiscount.value,
                            );

                            const pricedLineItem = Object.assign({}, savedLineItem, {
                                discounts: [createdDiscount],
                            });
                            this.transformationService.refreshLineItemPricing(
                                pricedLineItem,
                                invoice,
                                taxData.taxCodeRate,
                            );
                            savedLineItem.taxRate = pricedLineItem.taxRate;
                            savedLineItem.netTotal = pricedLineItem.netTotal;
                            savedLineItem = await this.lineItemCreateRepository.saveLineItem(savedLineItem);
                        }
                    }
                }
            }

            // Step 7: Recalculate invoice totals
            // Matches legacy: $lineItem->invoice->save() → Invoice::beforeSave (update path)
            const allLineItems = await this.lineItemCreateRepository.getLineItemsWithDiscounts(invoiceId);
            const lineItemTaxSum = await this.lineItemCreateRepository.getLineItemTaxSum(invoiceId);
            const paidAmount = await this.lineItemCreateRepository.getInvoicePaidAmount(invoiceId);

            const { newSubTotal, newTax, newTotal, newBalance, newStatus } =
                this.transformationService.transformCreateTotals(
                    allLineItems,
                    invoice,
                    lineItemTaxSum,
                    paidAmount,
                );

            await this.lineItemCreateRepository.updateInvoiceTotals(
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
            return this.transformationService.transformCreateLineItemResponse(
                savedLineItem.id,
            );
        } catch (error) {
            console.error('Error in createLineItem service:', error);

            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }

            throw new BadRequestException(
                `Failed to create line item: ${error.message}`,
            );
        }
    }
}
