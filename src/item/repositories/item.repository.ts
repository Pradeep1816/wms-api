import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Item } from '../entities/item.entity';
import { ItemLocationStock } from '../entities/item-location-stock.entity';
import { UpdateItemStockRequestDto } from '../dto/update-item-stock-request.dto';
import { CreateItemCategoryRequestDto } from '../dto/create-item-category-request.dto';
import { ItemCategory } from '../entities/item-category.entity';
import { UpdateItemCategoryRequestDto } from '../dto/update-item-category-request.dto';
import { GetItemsRequestDto } from '../dto/item-request.dto';
import { ItemCategoryRequestDto } from '../dto/item-category-request.dto';
import { CreateItemRequestDto } from '../dto/create-item-request.dto';
import { UpdateItemRequestDto } from '../dto/update-item-request.dto';
import { TaxStatus } from '../../tax/entities/tax-status.entity';
import { LocationCategoryRoyalty } from '../../location/entities/location-category-royalty.entity';
import { LocationDebt } from '../../location/entities/location-debt.entity';
import { Location } from '../../location/entities/location.entity';
import { queueLowStockAlert } from '../services/low-stock-alert.util';

export interface NormalizedImportItem {
  itemCategoryId: number;
  code: string;
  upcCode?: string | null;
  description: string;
  price: number;
  royaltyFree: number;
  taxStatusId: number;
  status: number;
}

@Injectable()
export class ItemRepository {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(ItemLocationStock)
    private readonly stockRepository: Repository<ItemLocationStock>,
  ) {}


  async getInstrumentRentalByLocation(locationId: number): Promise<Item[]> {
    return this.itemRepository
      .createQueryBuilder('item')
      .where('item.locationId = :locationId', { locationId })
      .andWhere('item.isDeleted = :isDeleted', { isDeleted: 0 })
      .andWhere('item.itemCategoryId = :categoryId', { categoryId: Item.TYPE_RENTAL })
      .andWhere('item.status = :status', { status: true })
      .orderBy('item.id', 'ASC')
      .getMany();
  }


  // get all item categories - with optional pagination

async getAllItemCategories(
  queryParams: ItemCategoryRequestDto,
  locationId: number,
): Promise<{ items: any[], total: number }> {
  const { page, limit, sort, order} = queryParams;

  const query = this.itemRepository.manager
    .createQueryBuilder()
    .select([
      'category.id AS id',
      'category.name AS name',
      'category.description AS description',
      `CASE
        WHEN category.id = ${ItemCategory.CATEGORY_LESSON} THEN COALESCE(lessonRoyalty.value, 0)
        WHEN category.id = ${ItemCategory.CATEGORY_OPENING_BALANCE} THEN 0
        ELSE COALESCE(locationRate.royality, 0)
      END AS royality`,
    ])
    .from(ItemCategory, 'category')
    .leftJoin(
      LocationCategoryRoyalty,
      'locationRate',
      'locationRate.itemCategoryId = category.id AND locationRate.locationId = :locationId',
      { locationId },
    )
    .leftJoin(
      LocationDebt,
      'lessonRoyalty',
      'lessonRoyalty.locationId = :locationId AND lessonRoyalty.type = :royaltyType',
      { locationId, royaltyType: LocationDebt.TYPE_ROYALTY },
    )
    .where('category.isDeleted = :isDeleted', { isDeleted: false });

  if (sort) {
    const sortColumns = {
      id: 'category.id',
      name: 'category.name',
      description: 'category.description',
      royality: 'royality',
    } as const;
    const sortColumn = sortColumns[sort as keyof typeof sortColumns];
    if (sortColumn) {
      query.orderBy(sortColumn, (order?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'));
    }
  }

  const total = await query.getCount();

  // Only apply pagination if both page and limit are provided
  if (page && limit) {
    query.offset((page - 1) * limit).limit(limit);
  }

  const items = await query.getRawMany();

  return { items, total };
}


// get filtered items
  async getFilteredItems(
  locationId: number,
  page: number,
  limit: number,
  sortBy: string = 'id',
  sortOrder: 'ASC' | 'DESC' = 'ASC',
  code?: string,
  upcCode?: string,
  description?: string,
  itemCategory?: string,
  uncheckShowAll?: boolean
) {
  const query = this.itemRepository
    .createQueryBuilder('item')
    .leftJoin('item_category', 'category', 'category.id = item.itemCategoryId')
    .leftJoin('tax_status', 'tax', 'tax.id = item.taxStatusId')
    .leftJoin(
      'item_location_stock',
      'stock',
      'stock.itemId = item.id AND stock.locationId = :locationId',
      { locationId },
    )
    .where('item.isDeleted = :isDeleted', { isDeleted: 0 })
    .andWhere('(item.locationId = :locationId OR item.locationId = 0)', { locationId })
    .select([
      'item.id AS id',
      'item.code AS code',
      'item.upcCode AS upcCode',
      'category.name AS itemCategory',
      'item.description AS description',
      'item.price AS price',
      'item.royaltyFree AS royaltyFree',
      'item.status AS status',
      'tax.name AS taxName',
      'stock.trackInventory AS trackInventory',
      'stock.stockQuantity AS stockQuantity',
      'stock.lowStockQuantity AS lowStockQuantity',
    ]);

  if (code) {
    query.andWhere('item.code LIKE :code', { code: `%${code}%` });
  }

  if (upcCode) {
    query.andWhere('item.upcCode LIKE :upcCode', { upcCode: `%${upcCode}%` });
  }

  if (description) {
    query.andWhere('item.description LIKE :description', { description: `%${description}%` });
  }

  if (itemCategory) {
    query.andWhere('category.name LIKE :itemCategory', { itemCategory: `%${itemCategory}%` });
  }

  if(uncheckShowAll) {
    query.andWhere('item.status = :status', { status: 1 });
  }
  
  // Default sort by id ASC when sort params not provided
  query.orderBy(`item.${sortBy || 'id'}`, sortOrder || 'ASC');

  const total = await query.getCount();
  query.offset((page - 1) * limit).limit(limit);


  const items = await query.getRawMany();

 

  return { items, total };
}


  async updateItemStock(
    itemId: number,
    locationId: number,
    dto: UpdateItemStockRequestDto,
  ): Promise<ItemLocationStock> {
    const item = await this.itemRepository.findOne({
      where: {
        id: itemId,
        locationId: In([locationId, 0]),
        isDeleted: false,
      },
    });
    if (!item) {
      throw new NotFoundException('Item not found for this location');
    }
    if (['LESSON', 'OPENING BALANCE'].includes(item.code.trim().toUpperCase())) {
      throw new BadRequestException('Stock cannot be set for accounting items');
    }

    // Payloads from the previous Items UI did not include trackInventory.
    // Treat a supplied stock quantity as tracked so API and web can be deployed
    // in either order; new rows without either value remain untracked.
    const trackInventory = dto.trackInventory ?? dto.stockQuantity != null;
    const stock = this.stockRepository.create({
      itemId,
      locationId,
      trackInventory,
      stockQuantity: trackInventory ? dto.stockQuantity! : null,
      lowStockQuantity: trackInventory ? (dto.lowStockQuantity ?? null) : null,
    });
    await this.stockRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(ItemLocationStock);
      // Establish the composite-key row before locking, including concurrent
      // first-time edits. Never overwrite an existing quantity with the seed.
      await repository.createQueryBuilder().insert().values({ itemId, locationId })
        .orIgnore().execute();
      const before = await repository.findOneOrFail({
        where: { itemId, locationId }, lock: { mode: 'pessimistic_write' },
      });
      await repository.upsert(stock, ['itemId', 'locationId']);
      await queueLowStockAlert(manager, before, stock);
    });
    return stock;
  }

  /**
   * Create a new Item.
   * Mirrors legacy Item::beforeSave insert behavior (isDeleted = false).
   * Legacy does not enforce (code, locationId) uniqueness.
   */
  async createItem(
    locationId: number,
    createDto: CreateItemRequestDto,
  ): Promise<Item> {
    const { itemCategoryId, code, upcCode, description, price, royaltyFree, taxStatusId, status } =
      createDto;
    const normalizedUpcCode = this.normalizeUpcCode(upcCode);

    await this.assertActiveItemCategory(itemCategoryId);

    await this.assertUniqueUpcCode(locationId, normalizedUpcCode);

    const item = this.itemRepository.create({
      itemCategoryId,
      locationId,
      code,
      upcCode: normalizedUpcCode,
      description,
      price,
      royaltyFree,
      taxStatusId: taxStatusId ?? 1,
      status,
      isDeleted: false,
    } as Partial<Item>);

    return this.itemRepository.save(item);
  }

  async upsertImportItem(
    locationId: number,
    itemData: NormalizedImportItem,
  ): Promise<{ item: Item; action: 'created' | 'updated' }> {
    await this.assertActiveItemCategory(itemData.itemCategoryId);
    const normalizedUpcCode = this.normalizeUpcCode(itemData.upcCode);
    const existing = normalizedUpcCode
      ? await this.itemRepository.findOne({
          where: {
            upcCode: normalizedUpcCode,
            locationId,
            isDeleted: false,
          } as any,
        })
      : null;

    if (existing) {
      if (existing.code === 'LESSON' || existing.code === 'OPENING BALANCE') {
        throw new BadRequestException(
          'Lesson and opening balance items cannot be modified from Backend.',
        );
      }

      existing.itemCategoryId = itemData.itemCategoryId;
      existing.code = itemData.code;
      existing.upcCode = normalizedUpcCode;
      existing.description = itemData.description;
      existing.price = itemData.price;
      existing.royaltyFree = itemData.royaltyFree;
      existing.taxStatusId = itemData.taxStatusId;
      existing.status = itemData.status;

      return {
        item: await this.itemRepository.save(existing),
        action: 'updated',
      };
    }

    const item = this.itemRepository.create({
      ...itemData,
      upcCode: normalizedUpcCode,
      locationId,
      isDeleted: false,
    } as Partial<Item>);

    return {
      item: await this.itemRepository.save(item),
      action: 'created',
    };
  }

  /**
   * Update an existing Item.
    * - Blocks legacy-protected items (LESSON / OPENING BALANCE)
   */
  async updateItem(
    id: number,
    locationId: number,
    updateDto: UpdateItemRequestDto,
  ): Promise<Item> {
    const {
      itemCategoryId,
      code,
      upcCode,
      description,
      price,
      royaltyFree,
      taxStatusId,
      status,
    } = updateDto;

    const item = await this.itemRepository.findOne({
      where: {
        id,
        locationId,
        isDeleted: false,
      } as any,
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    await this.assertActiveItemCategory(itemCategoryId);

    // Legacy: Lesson / Opening balance items cannot be modified from Backend
    if (item.code === 'LESSON' || item.code === 'OPENING BALANCE') {
      throw new BadRequestException(
        'Lesson and opening balance items cannot be modified from Backend.',
      );
    }

    // Validate taxStatusId exists if provided
    if (typeof taxStatusId === 'number') {
      const taxStatusRepo = this.itemRepository.manager.getRepository(TaxStatus);
      const taxStatus = await taxStatusRepo.findOne({
        where: { id: taxStatusId },
      });
      if (!taxStatus) {
        throw new BadRequestException('Invalid taxStatusId.');
      }
    }

    // Apply updates
    const normalizedUpcCode = this.normalizeUpcCode(upcCode);
    await this.assertUniqueUpcCode(locationId, normalizedUpcCode, item.id);

    item.itemCategoryId = itemCategoryId;
    item.code = code;
    if (upcCode !== undefined) {
      item.upcCode = normalizedUpcCode;
    }
    item.description = description;
    item.price = price;
    item.royaltyFree = royaltyFree;
    item.taxStatusId = taxStatusId ?? item.taxStatusId;
    item.status = status;

    return this.itemRepository.save(item);
  }

  private async assertActiveItemCategory(itemCategoryId: number): Promise<void> {
    const category = await this.itemRepository.manager
      .getRepository(ItemCategory)
      .findOne({ where: { id: itemCategoryId, isDeleted: false } });

    if (!category) {
      throw new BadRequestException(
        'Item category is deleted or does not exist.',
      );
    }
  }

  private normalizeUpcCode(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed === '' ? null : trimmed;
  }

  private async assertUniqueUpcCode(
    locationId: number,
    upcCode: string | null,
    excludeItemId?: number,
  ): Promise<void> {
    if (!upcCode) return;

    const duplicate = await this.itemRepository.findOne({
      where: {
        upcCode,
        locationId,
        isDeleted: false,
      } as any,
    });

    if (duplicate && duplicate.id !== excludeItemId) {
      throw new ConflictException(
        'An item with this UPC code already exists for this location.',
      );
    }
  }

  async softDeleteItem(id: number, locationId: number): Promise<Item> {
    const item = await this.itemRepository.findOne({
      where: {
        id,
        locationId,
        isDeleted: false,
      } as any,
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    if (item.code === 'LESSON' || item.code === 'OPENING BALANCE') {
      throw new BadRequestException(
        'Lesson and opening balance items cannot be modified from Backend.',
      );
    }

    item.status = 0;
    item.isDeleted = true;

    return this.itemRepository.save(item);
  }


async createItemCategory(
    createDto: CreateItemCategoryRequestDto,
    userId: number,
    locationId: number,
  ) {
    const queryRunner =
      this.itemRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { ...(queryRunner.data ?? {}), currentUserId: userId };

      const activeLocations = await queryRunner.manager.find(Location, {
        select: { id: true },
        where: { isDeleted: false },
      });
      const lessonRoyalties = activeLocations.length
        ? await queryRunner.manager.find(LocationDebt, {
            where: {
              locationId: In(activeLocations.map((location) => location.id)),
              type: In([
                LocationDebt.TYPE_ROYALTY,
                LocationDebt.TYPE_ADVERTISEMENT,
              ]),
            },
          })
        : [];

      const advertisementByLocation = new Map(
        lessonRoyalties
          .filter((debt) => debt.type === LocationDebt.TYPE_ADVERTISEMENT)
          .map((debt) => [debt.locationId, Number(debt.value)]),
      );
      const lessonRoyaltyByLocation = new Map<number, number>();
      for (const lessonRoyalty of lessonRoyalties.filter(
        (debt) => debt.type !== LocationDebt.TYPE_ADVERTISEMENT,
      )) {
        if (lessonRoyaltyByLocation.has(lessonRoyalty.locationId)) {
          throw new ConflictException(
            `Location ${lessonRoyalty.locationId} has more than one lesson royalty.`,
          );
        }
        lessonRoyaltyByLocation.set(
          lessonRoyalty.locationId,
          Number(lessonRoyalty.value),
        );
      }

      const missingLocation = activeLocations.find(
        (location) => !lessonRoyaltyByLocation.has(location.id),
      );
      if (missingLocation) {
        throw new ConflictException(
          `Location ${missingLocation.id} must have a lesson royalty before creating an item category.`,
        );
      }

      const created = queryRunner.manager.create(ItemCategory, {
        name: createDto.name.trim(),
        description: createDto.description?.trim() || null,
        // Retain the legacy column for rolling-deployment compatibility. Runtime
        // sale logic uses the location-specific mappings created below.
        royality: createDto.royality ?? 0,
        isDeleted: false,
      });
      await queryRunner.manager.save(ItemCategory, created);

      // A category is shared by every location. Seed every active location from
      // its lesson rate so a newly created category is immediately consistent
      // with the location's existing royalty setup.
      const locationRates = activeLocations.map((location) =>
        queryRunner.manager.create(LocationCategoryRoyalty, {
          locationId: location.id,
          itemCategoryId: created.id,
          royality: lessonRoyaltyByLocation.get(location.id),
          advertisement: advertisementByLocation.get(location.id) ?? 0,
          createdByUserId: userId,
          updatedByUserId: userId,
        }),
      );
      if (locationRates.length) {
        await queryRunner.manager.save(LocationCategoryRoyalty, locationRates);
      }

      await queryRunner.commitTransaction();
      return {
        ...created,
        royality: lessonRoyaltyByLocation.get(locationId) ?? created.royality,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async getExistingCategory(id: number, queryRunner) {
    return await queryRunner.manager
      .createQueryBuilder()
      .select('item_category')
      .from(ItemCategory, 'item_category')
      .where('item_category.id = :id', { id })
      .andWhere('item_category.isDeleted = false')
      .getOne();
  }
  async updateItemCategory(
  id: number,
  updateDto: UpdateItemCategoryRequestDto,
  userId: number,
  locationId: number,
) {
  const queryRunner =
    this.itemRepository.manager.connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    queryRunner.data = { ...(queryRunner.data ?? {}), currentUserId: userId };
    const existingCategory = await this.getExistingCategory(id, queryRunner);

    if (!existingCategory) {
      throw new NotFoundException('Item category not found');
    }

    if (updateDto.name !== undefined) {
      existingCategory.name = updateDto.name.trim();
    }
    if (updateDto.description !== undefined) {
      existingCategory.description = updateDto.description?.trim() || null;
    }
    if (updateDto.royality !== undefined) {
      existingCategory.royality = updateDto.royality;
    }

    const updatedCategory = await queryRunner.manager.save(
      ItemCategory,
      existingCategory,
    );

    if (updateDto.royality !== undefined) {
      const rateRepository = queryRunner.manager.getRepository(LocationCategoryRoyalty);
      let locationRate = await rateRepository.findOne({
        where: { locationId, itemCategoryId: id },
      });
      if (!locationRate) {
        locationRate = rateRepository.create({
          locationId,
          itemCategoryId: id,
          royality: updateDto.royality,
          createdByUserId: userId,
          updatedByUserId: userId,
        });
      } else {
        locationRate.royality = updateDto.royality;
        locationRate.updatedByUserId = userId;
      }
      await rateRepository.save(locationRate);
    }

    await queryRunner.commitTransaction();

  
    return updatedCategory;

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;

  } finally {
    await queryRunner.release();
  }
}

async deleteItemCategory(id: number, userId: number) {
  const queryRunner = this.itemRepository.manager.connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    queryRunner.data = { ...(queryRunner.data ?? {}), currentUserId: userId };
   
    const existingCategory = await this.getExistingCategory(id, queryRunner);

    if (!existingCategory) {
      throw new NotFoundException('Item Category not found');
    }


    existingCategory.isDeleted = true;
    await queryRunner.manager.save(ItemCategory, existingCategory);


    await queryRunner.commitTransaction();


    return {
      id: id,
      name: existingCategory.name,
      deletedByUserId: userId,
    };

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
}
