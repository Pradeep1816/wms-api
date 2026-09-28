import { Injectable, BadRequestException } from '@nestjs/common';
import { InvoiceLineItemShowRepository } from '../repositories/invoice-line-item-show.repository';
import { ShowInvoiceLineItemRequestDto } from '../dto/show-invoice-line-item-request.dto';
import { ShowInvoiceLineItemResponseDto, ShowInvoiceLineItemPaginatedResponseDto } from '../dto/show-invoice-line-item-response.dto';

@Injectable()
export class InvoiceLineItemShowService {
    constructor(
        private readonly invoiceLineItemShowRepository: InvoiceLineItemShowRepository,
    ) { }

    /**
     * Get items for the Add Line Items modal.
     * Matches legacy InvoiceController::actionShowItems
     */
    async getItems(
        locationId: number,
        query: ShowInvoiceLineItemRequestDto,
    ): Promise<ShowInvoiceLineItemPaginatedResponseDto> {
        try {
            const page = query.page ?? 1;
            const limit = query.limit ?? 20;
            const sortOrder = query.order ? (query.order.toUpperCase() as 'ASC' | 'DESC') : undefined;

            const { items, total } = await this.invoiceLineItemShowRepository.getItems(
                locationId,
                query.code,
                query.description,
                query.sort,
                sortOrder,
                page,
                limit,
            );

            const transformedItems: ShowInvoiceLineItemResponseDto[] = items.map((item) => ({
                id: item.id,
                code: item.code || '',
                upcCode: item.upcCode || null,
                description: item.description || '',
                price: item.price ?? 0,
            }));

            return {
                body: transformedItems,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            };
        } catch (error) {
            console.error('Error in getItems service:', error);
            throw new BadRequestException(`Failed to retrieve items: ${error.message}`);
        }
    }
}
