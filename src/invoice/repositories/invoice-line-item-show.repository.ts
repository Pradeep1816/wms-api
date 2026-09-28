import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from '../../item/entities/item.entity';

@Injectable()
export class InvoiceLineItemShowRepository {
    constructor(
        @InjectRepository(Item)
        private readonly itemRepository: Repository<Item>,
    ) { }

    /**
     * Fetch items for the Add Line Items modal.
     * Matches legacy: notDeleted + location-scoped + active only.
     * Supports LIKE filtering on code/description.
     * By default no sorting is applied.
     */
    async getItems(
        locationId: number,
        code?: string,
        description?: string,
        sortField?: string,
        sortOrder?: 'ASC' | 'DESC',
        page: number = 1,
        limit: number = 20,
    ): Promise<{ items: Item[]; total: number }> {
        const qb = this.itemRepository
            .createQueryBuilder('item')
            .where('item.isDeleted = :isDeleted', { isDeleted: 0 })
            .andWhere('item.locationId = :locationId', { locationId })
            .andWhere('item.status = :status', { status: 1 });

        // LIKE filtering on code
        if (code) {
            qb.andWhere('item.code LIKE :code', { code: `%${code}%` });
        }

        // LIKE filtering on description
        if (description) {
            qb.andWhere('item.description LIKE :description', { description: `%${description}%` });
        }

        // Sorting — only on allowed fields, by default NO sorting
        const allowedSortFields: Record<string, string> = {
            code: 'item.code',
            description: 'item.description',
        };

        if (sortField && sortOrder && allowedSortFields[sortField]) {
            qb.orderBy(allowedSortFields[sortField], sortOrder);
        }

        // Pagination
        const offset = (page - 1) * limit;
        qb.skip(offset).take(limit);

        const [items, total] = await qb.getManyAndCount();

        return { items, total };
    }
}
