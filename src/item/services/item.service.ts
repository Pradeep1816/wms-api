import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemCategory } from '../entities/item-category.entity';
import { Location } from '../../location/entities/location.entity';
import { ItemCategoryResponseDto } from '../dto/item-category-response.dto';
import { ItemRepository } from '../repositories/item.repository';
import { GetItemsRequestDto } from '../dto/item-request.dto';
import { plainToInstance } from 'class-transformer';
import { CreateItemCategoryResponseDto } from '../dto/create-item-category-response.dto';
import { CreateItemCategoryRequestDto } from '../dto/create-item-category-request.dto';
import { UpdateItemCategoryRequestDto } from '../dto/update-item-category-request.dto';
import { UpdateItemCategoryResponseDto } from '../dto/update-item-category-response.dto';
import { DeleteItemCategoryResponseDto } from '../dto/delete-item-category-response.dto';
import { ItemListResponseDto } from '../dto/item-response.dto';
import { ItemCategoryRequestDto } from '../dto/item-category-request.dto';
import { CreateItemRequestDto } from '../dto/create-item-request.dto';
import { CreateItemResponseDto } from '../dto/create-item-response.dto';
import { UpdateItemRequestDto } from '../dto/update-item-request.dto';
import { UpdateItemStockRequestDto } from '../dto/update-item-stock-request.dto';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { TaxStatus } from '../../tax/entities/tax-status.entity';
import { RoundingUtils } from '../../utils/rounding.utils';
import {
  ImportItemRowDto,
  ImportItemRowResult,
  ImportItemsRequestDto,
  ImportItemsResponseDto,
} from '../dto/import-items-request.dto';


@Injectable()
export class ItemService {
  constructor(
    @InjectRepository(ItemCategory)
    private readonly itemCategoryRepo: Repository<ItemCategory>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @InjectRepository(TaxStatus)
    private readonly taxStatusRepo: Repository<TaxStatus>,
    private readonly ItemRepository: ItemRepository,
  ) { }

  // async getItemCategories(locationSlug: string): Promise<ItemCategoryResponseDto[]> {
  //   // Verify location exists
  //   const location = await this.locationRepo.findOne({ where: { slug: locationSlug } });
  //   if (!location) {
  //     return [];
  //   }

  //   // Get all item categories
  //   const categories = await this.itemCategoryRepo.find({
  //     where: { isDeleted: false },
  //     select: ['id', 'name'],
  //   });


  //   let itemCategories = categories.map(category => ({
  //     id: category.id,
  //     name: category.name
  //   }));
  //   return itemCategories;
  // }

  async getAllItemCategories(queryParams: ItemCategoryRequestDto, locationId: number) {
    try {
      const { items, total } = await this.ItemRepository.getAllItemCategories(
        queryParams,
        locationId,
      );
      const mappedItems = items.map((i: any) => ({
        id: i.id,
        name: i.name,
        description: i.description ?? null,
        royality: Number(i.royality || 0),
      }));

      // If page and limit are not provided, return without pagination
      if (!queryParams.page || !queryParams.limit) {
        return mappedItems;
      }

      // Return with pagination
      return {
        body: mappedItems,
        pagination: {
          page: queryParams.page,
          limit: queryParams.limit,
          total,
          totalPages: Math.ceil(total / queryParams.limit),
        },
      };
    } catch (error) {
      console.error('Error in getAllItemsCategories service:', error);
      throw new BadRequestException('Failed to retrieve items');
    }
  }



  async getFilteredItems(locationId: number, queryParams: GetItemsRequestDto) {
    const {
      page = 1,
      limit = 20,
      sortBy,
      sortOrder,
      code,
      upcCode,
      description,
      itemCategory,
      showAll,
    } = queryParams;

    const showAllFlag = showAll === true;

    const { items, total } = await this.ItemRepository.getFilteredItems(
      locationId,
      page,
      limit,
      sortBy,
      sortOrder,
      code,
      upcCode,
      description,
      itemCategory,
      !showAllFlag,
    );

    const mappedItems = items.map(i => ({
      id: i.id,
      code: i.code,
      upcCode: i.upcCode,
      itemCategory: i.itemCategory,
      description: i.description,
      price: i.price,
      royaltyFree: i.royaltyFree ? 'Yes' : 'No',
      tax: i.taxName,
      status: i.status ? 'Enable' : 'Disable',
      trackInventory: i.trackInventory === true || Number(i.trackInventory) === 1,
      stockQuantity: i.stockQuantity == null ? null : Number(i.stockQuantity),
      lowStockQuantity: i.lowStockQuantity == null ? null : Number(i.lowStockQuantity),
    }));

    const pagination = {
      page,
      limit,
      total,
      totalPages: showAllFlag ? 1 : Math.ceil(total / limit),
    };

    return {
      body: mappedItems,
      pagination,
    };
  }

  async updateItemStock(
    itemId: number,
    locationId: number,
    userRoles: string[],
    dto: UpdateItemStockRequestDto,
  ) {
    this.assertCanManageCentralItems(userRoles, 'manage stock');
    return this.ItemRepository.updateItemStock(itemId, locationId, dto);
  }

  /**
   * Create a new Item for a given location.
   */
  async createItem(
    locationId: number,
    userId: number, // reserved for future auditing
    userRoles: string[],
    createDto: CreateItemRequestDto,
  ): Promise<CreateItemResponseDto> {
    try {
      this.assertCanManageCentralItems(userRoles, 'create items');

      const item = await this.ItemRepository.createItem(locationId, createDto);

      const response = plainToInstance(CreateItemResponseDto, item, {
        excludeExtraneousValues: true,
      });

      return response;
    } catch (error) {
      console.error('Error in createItem service:', error);

      if (error instanceof ForbiddenException) {
        throw error;
      }

      if (error.message?.includes('UPC code') ||
        error.message?.includes('Item category')) {
        throw new BadRequestException(error.message);
      }

      throw new BadRequestException('Failed to create item');
    }
  }

  /**
   * Update an existing Item for a given location.
   */
  async updateItem(
    id: number,
    locationId: number,
    userId: number,
    userRoles: string[],
    updateDto: UpdateItemRequestDto,
  ): Promise<CreateItemResponseDto> {
    try {
      this.assertCanManageCentralItems(userRoles, 'update items');

      const item = await this.ItemRepository.updateItem(
        id,
        locationId,
        updateDto,
      );

      const response = plainToInstance(CreateItemResponseDto, item, {
        excludeExtraneousValues: true,
      });

      return response;
    } catch (error) {
      console.error('Error in updateItem service:', error);

      if (error instanceof NotFoundException) {
        throw error;
      }

      if (
        error.message?.includes('UPC code') ||
        error.message?.includes('Item category') ||
        error.message?.includes('Invalid taxStatusId') ||
        error.message?.includes('cannot be modified from Backend')
      ) {
        throw new BadRequestException(error.message);
      }

      if (error instanceof ForbiddenException) {
        throw error;
      }

      throw new BadRequestException('Failed to update item');
    }
  }

  async deleteItem(
    id: number,
    locationId: number,
    userRoles: string[],
  ): Promise<CreateItemResponseDto> {
    try {
      this.assertCanManageCentralItems(userRoles, 'delete items');

      const item = await this.ItemRepository.softDeleteItem(id, locationId);

      return plainToInstance(CreateItemResponseDto, item, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      console.error('Error in deleteItem service:', error);

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      throw new BadRequestException('Failed to delete item');
    }
  }

  async importItems(
    locationId: number,
    userRoles: string[],
    importDto: ImportItemsRequestDto,
  ): Promise<ImportItemsResponseDto> {
    this.assertCanManageCentralItems(userRoles, 'import items');

    const categories = await this.itemCategoryRepo.find({
      where: { isDeleted: false },
    });
    const categoryByName = new Map(
      categories.map((category) => [this.normalizedKey(category.name), category]),
    );

    const taxStatuses = await this.taxStatusRepo.find();
    const taxStatusByName = new Map(
      taxStatuses.map((taxStatus) => [this.normalizedKey(taxStatus.name), taxStatus]),
    );

    const results: ImportItemRowResult[] = [];
    const errors: ImportItemRowResult[] = [];
    const seenUpcCodes = new Set<string>();
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (let index = 0; index < importDto.rows.length; index += 1) {
      const sourceRow = importDto.rows[index];
      const rowNumber = index + 2;
      const validation = this.normalizeImportRow(
        sourceRow,
        rowNumber,
        categoryByName,
        taxStatusByName,
      );

      if (validation.item?.upcCode) {
        const upcKey = this.normalizedKey(validation.item.upcCode);
        if (seenUpcCodes.has(upcKey)) {
          validation.errors.push('Duplicate UPC code in import file.');
        }
        seenUpcCodes.add(upcKey);
      }

      if (validation.errors.length > 0 || !validation.item) {
        const result: ImportItemRowResult = {
          row: rowNumber,
          code: sourceRow.code,
          upcCode: sourceRow.upcCode,
          action: 'skipped',
          errors: validation.errors,
        };
        results.push(result);
        errors.push(result);
        skipped += 1;
        continue;
      }

      try {
        const saved = await this.ItemRepository.upsertImportItem(locationId, validation.item);
        if (saved.action === 'created') {
          created += 1;
        } else {
          updated += 1;
        }
        results.push({
          row: rowNumber,
          code: validation.item.code,
          upcCode: validation.item.upcCode || undefined,
          action: saved.action,
          errors: [],
        });
      } catch (error) {
        const result: ImportItemRowResult = {
          row: rowNumber,
          code: validation.item.code,
          upcCode: validation.item.upcCode || undefined,
          action: 'skipped',
          errors: [error.message || 'Failed to import row.'],
        };
        results.push(result);
        errors.push(result);
        skipped += 1;
      }
    }

    return {
      created,
      updated,
      skipped,
      totalRows: importDto.rows.length,
      errors,
      results,
    };
  }

  private assertCanManageCentralItems(userRoles: string[], action: string): void {
    const canManage =
      userRoles?.includes(RolesEnum.ADMINISTRATOR) ||
      userRoles?.includes(RolesEnum.OWNER);

    if (!canManage) {
      throw new ForbiddenException(`Only admin and owner users can ${action}.`);
    }
  }

  private normalizeImportRow(
    row: ImportItemRowDto,
    rowNumber: number,
    categoryByName: Map<string, ItemCategory>,
    taxStatusByName: Map<string, TaxStatus>,
  ): {
      item?: {
        itemCategoryId: number;
        code: string;
        upcCode?: string | null;
        description: string;
      price: number;
      royaltyFree: number;
      taxStatusId: number;
      status: number;
    };
    errors: string[];
  } {
    const errors: string[] = [];
    const code = this.toTrimmedString(row.code);
    const upcCode = this.toTrimmedString(row.upcCode) || null;
    const description = this.toTrimmedString(row.description);
    const categoryName = this.toTrimmedString(row.itemCategory);
    const taxStatusName = this.toTrimmedString(row.taxStatus);
    const price = this.toMoney(row.price);
    const royaltyFree = this.toBooleanNumber(row.royaltyFree, 0);
    const status = this.toBooleanNumber(row.status, 1);

    if (!code) {
      errors.push('Code is required.');
    } else if (code.length > 150) {
      errors.push('Code must be 150 characters or fewer.');
    }

    if (upcCode && upcCode.length > 150) {
      errors.push('UPC code must be 150 characters or fewer.');
    }

    if (!description) {
      errors.push('Description is required.');
    } else if (description.length > 500) {
      errors.push('Description must be 500 characters or fewer.');
    }

    if (price === null) {
      errors.push('Price must be a number greater than or equal to 0.');
    }

    const category = categoryByName.get(this.normalizedKey(categoryName));
    if (!category) {
      errors.push(`Item category "${categoryName || '(blank)'}" was not found.`);
    }

    const taxStatus = taxStatusByName.get(this.normalizedKey(taxStatusName));
    if (!taxStatus) {
      errors.push(`Tax status "${taxStatusName || '(blank)'}" was not found.`);
    }

    if (royaltyFree === null) {
      errors.push('Royalty Free must be Yes/No, true/false, or 1/0.');
    }

    if (status === null) {
      errors.push('Status must be Enable/Disable, true/false, or 1/0.');
    }

    if (errors.length > 0 || !category || !taxStatus || price === null || royaltyFree === null || status === null) {
      return { errors };
    }

    return {
      item: {
        itemCategoryId: category.id,
        code,
        upcCode,
        description,
        price,
        royaltyFree,
        taxStatusId: taxStatus.id,
        status,
      },
      errors,
    };
  }

  private toTrimmedString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  }

  private normalizedKey(value: unknown): string {
    return this.toTrimmedString(value).toLowerCase();
  }

  private toMoney(value: unknown): number | null {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      return null;
    }
    return RoundingUtils.roundDecimal(numericValue, 2);
  }

  private toBooleanNumber(value: unknown, defaultValue: number): number | null {
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }

    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    const normalized = this.normalizedKey(value);
    if (['1', 'yes', 'y', 'true', 'enable', 'enabled', 'active'].includes(normalized)) {
      return 1;
    }
    if (['0', 'no', 'n', 'false', 'disable', 'disabled', 'inactive'].includes(normalized)) {
      return 0;
    }

    return null;
  }

  async createItemCategory(
    userId: number,
    locationId: number,
    createDto: CreateItemCategoryRequestDto,
  ): Promise<CreateItemCategoryResponseDto | any> {
    try {

      const category = await this.ItemRepository.createItemCategory(
        createDto,
        userId,
        locationId,
      );


      const response = plainToInstance(CreateItemCategoryResponseDto, category, {
        excludeExtraneousValues: true,
      });



      response.createdByUserId = userId;

      return response;

    } catch (error) {
      console.error('Error in createItemCategory service:', error);

      throw new BadRequestException('Failed to create item category');
    }
  }
  async updateItemCategory(
    id: number,
    userId: number,
    locationId: number,
    updateDto: UpdateItemCategoryRequestDto,
  ): Promise<UpdateItemCategoryResponseDto | any> {
    try {
      // Prevent updating protected categories (Lesson, Opening Balance)
      if (!ItemCategory.canUpdate(id)) {
        throw new BadRequestException('Lesson and opening balance items cannot be modified from Backend.');
      }

      const updatedCategory: any = await this.ItemRepository.updateItemCategory(
        id,
        updateDto,
        userId,
        locationId,
      );

      const response = plainToInstance(UpdateItemCategoryResponseDto, updatedCategory, {
        excludeExtraneousValues: true,
      });

      response.updatedByUserId = userId;

      return response;

    } catch (error) {
      console.error('Error in updateItemCategory service:', error);

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException('Failed to update item category');
    }
  }
  async deleteItemCategory(
    id: number,
    userId: number,
  ): Promise<DeleteItemCategoryResponseDto> {
    try {
      // Prevent deleting protected categories (Lesson, Opening Balance)
      if (!ItemCategory.canUpdate(id)) {
        throw new BadRequestException('Lesson and opening balance items cannot be modified from Backend.');
      }

      const deletedResult = await this.ItemRepository.deleteItemCategory(id, userId);

      if (!deletedResult) {
        throw new BadRequestException('Failed to delete item category');
      }


      const response = plainToInstance(DeleteItemCategoryResponseDto, deletedResult, {
        excludeExtraneousValues: true,
      });



      return response;

    } catch (error) {
      console.error('Error in deleteItemCategory service:', error);


      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException('Failed to delete item category');
    }
  }


}
