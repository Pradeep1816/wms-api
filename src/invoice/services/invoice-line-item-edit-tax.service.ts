import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InvoicePosLinesService } from './invoice-pos-lines.service';
import { InvoiceLineItemEditTaxRepository } from '../repositories/invoice-line-item-edit-tax.repository';
import { InvoiceLineItemEditTaxTransformationService } from './transformations/invoice-line-item-edit-tax-transformation.service';
import { EditTaxLineItemRequestDto, EditTaxLineItemResponseDto } from '../dto/edit-tax-line-item-request.dto';
import { EditTaxLineItemGetResponseDto } from '../dto/edit-tax-line-item-response.dto';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';

@Injectable()
export class InvoiceLineItemEditTaxService {
    constructor(
        private readonly editTaxRepository: InvoiceLineItemEditTaxRepository,
        private readonly transformationService: InvoiceLineItemEditTaxTransformationService,
        private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
        private readonly posLines: InvoicePosLinesService,
    ) { }

    // Edit tax status for line items. Validates tax, updates line items, recalculates invoice totals.
    async editTax(
        locationId: number,
        locationSlug: string,
        requestDto: EditTaxLineItemRequestDto,
        userId: number,
    ): Promise<EditTaxLineItemResponseDto> {
        try {
            // Step 1: Validate tax status — lookup tax data chain
            const taxData = await this.editTaxRepository.lookupTaxData(requestDto.taxStatus);
            if (!taxData) {
                throw new BadRequestException(
                    `Invalid tax status: "${requestDto.taxStatus}". Valid options are: Default, No Tax, GST Only.`,
                );
            }

            // Step 2: Fetch line items by IDs (location-scoped)
            const lineItems = await this.editTaxRepository.findLineItemsByIds(
                locationId,
                requestDto.lineItemIds,
            );

            if (lineItems.length === 0) {
                throw new NotFoundException(
                    `No line items found for the given IDs in location ${locationSlug}`,
                );
            }

            // Step 3: Guard — invoice must not be posted
            if ((await Promise.all([...new Set(lineItems.map(line => line.invoiceId))].map(id => this.posLines.hasPos(id)))).some(Boolean)) {
                const result = await this.posLines.editTax(locationId, locationSlug, requestDto.lineItemIds, requestDto.taxStatus, userId);
                return this.transformationService.transformResponse(result.count, result.rate);
            }
            // All line items belong to the same invoice (legacy behavior)
            const invoice = lineItems[0].invoice;
            if (invoice.isPosted) {
                throw new BadRequestException(
                    'Tax cannot be updated if invoice posted!',
                );
            }

            // Step 4: For each line item — recalculate tax fields and save
            let updatedCount = 0;
            for (const lineItem of lineItems) {
                const updateFields = this.transformationService.calculateUpdatedTaxFields(
                    lineItem,
                    requestDto.taxStatus,
                    taxData,
                    invoice,
                );

                await this.editTaxRepository.updateLineItemTax(lineItem.id, updateFields);
                updatedCount++;
            }

            // Step 5: Recalculate invoice cascade
            // Re-fetch line items with discounts after tax updates
            const allLineItemsWithDiscounts = await this.editTaxRepository.getLineItemsWithDiscounts(invoice.id);
            const lineItemTaxSum = await this.editTaxRepository.getLineItemTaxSum(invoice.id);
            const paidAmount = await this.editTaxRepository.getInvoicePaidAmount(invoice.id);

            const { subTotal, tax, total, balance, status } =
                this.transformationService.calculateInvoiceCascade(
                    allLineItemsWithDiscounts,
                    invoice,
                    lineItemTaxSum,
                    paidAmount,
                );

            // Step 6: Save invoice totals with isTaxAdjusted = false
            await this.editTaxRepository.updateInvoiceTotals(
                invoice,
                subTotal,
                tax,
                total,
                balance,
                status,
                userId,
            );

            // Match legacy Invoice::afterSave -> User::updateCustomerBalance.
            await this.customerBalanceRecalculatorService.recalculateAndPersist(invoice.userId, {
                locationSlug,
                updatedByUserId: userId,
            });

            // Step 7: Return response
            return this.transformationService.transformResponse(updatedCount, taxData.taxCodeRate);
        } catch (error) {
            console.error('Error in editTax service:', error);

            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }

            throw new BadRequestException(
                `Failed to edit tax: ${error.message}`,
            );
        }
    }

    /**
     * Get edit tax form data (current status, rate, available options).
     * Returns null for mixed statuses across multiple line items.
     */
    async getEditTaxData(
        locationId: number,
        locationSlug: string,
        lineItemIds: number[],
    ): Promise<EditTaxLineItemGetResponseDto> {
        try {
            // Fetch line items by IDs (location-scoped)
            const lineItems = await this.editTaxRepository.findLineItemsByIds(
                locationId,
                lineItemIds,
            );

            if (lineItems.length === 0) {
                throw new NotFoundException(
                    `No line items found for the given IDs in location ${locationSlug}`,
                );
            }

            // Guard: invoice must not be posted
            const invoice = lineItems[0].invoice;
            if (invoice.isPosted) {
                throw new BadRequestException(
                    'Tax cannot be updated if invoice posted!',
                );
            }

            // Determine current tax status
            let currentTaxStatus: string | null = lineItems[0].taxStatus;
            let currentTaxRate: number | null = null;

            // Check if all line items have the same tax status
            for (let i = 1; i < lineItems.length; i++) {
                if (lineItems[i].taxStatus !== currentTaxStatus) {
                    currentTaxStatus = null;  // Mixed statuses
                    currentTaxRate = null;
                    break;
                }
            }

            // Get tax rate for current status (if not mixed)
            if (currentTaxStatus) {
                // Step 1: Get province
                const provinceId = await this.editTaxRepository.getProvinceIdByLocation(locationId);
                if (!provinceId) {
                    throw new BadRequestException(
                        `Province not found for location ${locationSlug}`,
                    );
                }

                // Step 2: Get tax status
                const taxStatus = await this.editTaxRepository.getTaxStatusByName(currentTaxStatus);
                if (!taxStatus) {
                    throw new BadRequestException(
                        `Tax status "${currentTaxStatus}" not found in system`,
                    );
                }

                // Step 3: Get tax type association
                const taxAssoc = await this.editTaxRepository.getTaxAssocByStatusId(taxStatus.id);
                if (!taxAssoc) {
                    throw new BadRequestException(
                        `Tax type association not found for status "${currentTaxStatus}"`,
                    );
                }

                // Step 4: Get tax code
                const taxCode = await this.editTaxRepository.getTaxCodeByTypeAndProvince(
                    taxAssoc.taxTypeId,
                    provinceId,
                );
                if (!taxCode) {
                    throw new BadRequestException(
                        `Tax code not found for status "${currentTaxStatus}" in this province`,
                    );
                }

                currentTaxRate = parseFloat(String(taxCode.rate));
            }

            // Get all available tax statuses for dropdown
            const taxStatuses = await this.editTaxRepository.getAllTaxStatuses();

            // Get province for fetching rates
            const provinceId = await this.editTaxRepository.getProvinceIdByLocation(locationId);

            // Fetch rate for each available tax status
            let availableTaxStatusesWithRates = taxStatuses.map(ts => ({
                id: ts.id,
                name: ts.name,
                rate: 0,
            }));

            if (provinceId) {
                // Batch fetch all tax associations and codes in one go
                const taxStatusIds = taxStatuses.map(ts => ts.id);
                const taxAssociations = await this.editTaxRepository.getTaxAssocsByStatusIds(taxStatusIds);
                
                if (taxAssociations.length > 0) {
                    const taxTypeIds = taxAssociations.map(ta => ta.taxTypeId);
                    const taxCodes = await this.editTaxRepository.getTaxCodesByTypeIdsAndProvince(
                        taxTypeIds,
                        provinceId,
                    );

                    // Create lookup maps for O(1) access
                    const assocMap = new Map(taxAssociations.map(ta => [ta.taxStatusId, ta.taxTypeId]));
                    const codeMap = new Map(taxCodes.map(tc => [tc.taxTypeId, parseFloat(String(tc.rate))]));

                    availableTaxStatusesWithRates = taxStatuses.map(ts => ({
                        id: ts.id,
                        name: ts.name,
                        rate: codeMap.get(assocMap.get(ts.id) || 0) || 0,
                    }));
                }
            }

            return {
                currentTaxStatus,
                currentTaxRate,
                availableTaxStatuses: availableTaxStatusesWithRates,
            };
        } catch (error) {
            console.error('Error in getEditTaxData service:', error);

            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }

            throw new BadRequestException(
                `Failed to retrieve edit tax data: ${error.message}`,
            );
        }
    }
}
