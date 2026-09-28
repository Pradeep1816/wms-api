import { Body, Controller, Delete, Get, HttpException, Param, ParseIntPipe, Post, Put, Req } from '@nestjs/common';
import { ItemService } from '../services/item.service';
import { ItemCategoryResponseDto } from '../dto/item-category-response.dto';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { ApiResponse } from '../../shared/interceptors/response.interceptor';
import { GetItemsRequestDto } from '../dto/item-request.dto';
import {UseGuards, ValidationPipe } from '@nestjs/common'
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import{ Query } from '@nestjs/common';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { ItemCategoryRequestDto} from '../dto/item-category-request.dto';
import { CreateItemCategoryResponseDto } from '../dto/create-item-category-response.dto';
import { CreateItemCategoryRequestDto } from '../dto/create-item-category-request.dto';
import { UpdateItemCategoryRequestDto } from '../dto/update-item-category-request.dto';
import { UpdateItemCategoryResponseDto } from '../dto/update-item-category-response.dto';
import { DeleteItemCategoryResponseDto } from '../dto/delete-item-category-response.dto';
import { ItemListResponseDto } from '../dto/item-response.dto';
import { CreateItemRequestDto } from '../dto/create-item-request.dto';
import { CreateItemResponseDto } from '../dto/create-item-response.dto';
import { UpdateItemRequestDto } from '../dto/update-item-request.dto';
import { UpdateItemStockRequestDto } from '../dto/update-item-stock-request.dto';
import { ImportItemsRequestDto } from '../dto/import-items-request.dto';


@UseGuards(AuthGuard, RolesGuard,LocationResolveGuard)
@Controller('admin/v2/:location')
export class ItemController {
  constructor(private readonly itemService: ItemService) {}

  // get all item categories without pagination
  @Get('item-categories')
  @Roles(RolesEnum.BACKEND_USER)
  async getItemCategories(
	@LocationId() locationId: number,
	@Query(ValidationPipe) query:ItemCategoryRequestDto
	): Promise<ItemCategoryResponseDto[] | any> {
    try {
        
      const categories = await this.itemService.getAllItemCategories(query, locationId);
      
     return ResponseHelper.success(categories, 'Item categories retrieved successfully');
    } catch (error) {
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve item categories');
    }
  }

  // // get all item categories with pagination
  // @Get('item-category')
  // @Roles(RolesEnum.ADMINISTRATOR)
  // async getAllItemCategories(
  //  @Query(ValidationPipe) query:ItemCategoryRequestDto
	// ): Promise<ItemListResponseDto[] | any> {
  //   try {
        
  //     const categories = await this.itemService.getAllItemCategories(query);
      
  //    return ResponseHelper.success(categories, 'Items retrieved successfully');
  //   } catch (error) {
  //     return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve items');
  //   }
  // }

  @Get('items')
  @Roles(RolesEnum.BACKEND_USER)
  async getFilteredItems(
    @LocationId() locationId: number,
    @Query(ValidationPipe) queryParams: GetItemsRequestDto,
  ) {
      try {
      const data = await this.itemService.getFilteredItems(locationId, queryParams);
      return ResponseHelper.success(data, 'Items retrieved successfully');
    } catch (error) {
      console.error('Error in getFilteredItems:', error);

      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error.message?.includes('validation')) {
        return ResponseHelper.error('VALIDATION_ERROR', error.message);
      }

      if (error.message?.includes('DATABASE_ERROR')) {
        return ResponseHelper.error('DATABASE_ERROR', 'Database operation failed');
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve items');
    }
  }

@Post('item-categories')
@Roles(RolesEnum.ADMINISTRATOR)
async createItemCategory(
  @Req() req: any,
  @LocationId() locationId: number,
  @Body(ValidationPipe) createDto: CreateItemCategoryRequestDto,
): Promise<CreateItemCategoryResponseDto | any> {
  try {
    const userId = req.user?.id;

    const result = await this.itemService.createItemCategory(
      userId,
      locationId,
      createDto,
    );

    return ResponseHelper.success(
      result,
      'Item category created successfully',
    );

  } catch (error) {
    console.error('Error in createItemCategory controller:', error);

 
    if (error.message?.includes('not found')) {
      return ResponseHelper.error('NOT_FOUND', error.message);
    }


    if (
      error.message?.includes('required') ||
      error.message?.includes('Invalid') ||
      error.message?.includes('already exists')
    ) {
      return ResponseHelper.error('BAD_REQUEST', error.message);
    }

    return ResponseHelper.error(
      'INTERNAL_SERVER_ERROR',
      'Failed to create item category',
    );
  }
}

@Put('item-categories/:id')
@Roles(RolesEnum.BACKEND_USER)
async updateItemCategory(
  @Req() req: any,
  @LocationId() locationId: number,
  @Param('id') id: number,
  @Body(ValidationPipe) updateDto: UpdateItemCategoryRequestDto,
): Promise<UpdateItemCategoryResponseDto | any> {
  try {
    const userId = req.user?.id;

    const result = await this.itemService.updateItemCategory(
      id,
      userId,
      locationId,
      updateDto,
    );

    return ResponseHelper.success(
      result,
      `Item category updated successfully`,
    );

  } catch (error) {
    console.error('Error in updateItemCategory controller:', error);

    return ResponseHelper.error('INTERNAL_SERVER_ERROR', error.message);
  }
}
@Delete('item-categories/:id')
@Roles(RolesEnum.ADMINISTRATOR)
async deleteItemCategory(
  @Req() req: any,
  @Param('id') id: number,
): Promise<DeleteItemCategoryResponseDto | any> {
  try {
    const userId = req.user?.id;

    const result = await this.itemService.deleteItemCategory(
      id,
      userId,
    );

    return ResponseHelper.success(
      result,
      `Item category deleted successfully`,
    );
  } catch (error) {
    console.error('Error in deleteItemCategory controller:', error);

    if (error.message.includes('not found')) {
      return ResponseHelper.error('NOT_FOUND', error.message);
    }

    if (
      error.message.includes('required') ||
      error.message.includes('validation') ||
      error.message.includes('Invalid')
    ) {
      return ResponseHelper.error('BAD_REQUEST', error.message);
    }

    return ResponseHelper.error(
      'INTERNAL_SERVER_ERROR',
      'Failed to delete item category',
    );
  }
}

  @Post('items')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async createItem(
    @Req() req: any,
    @LocationId() locationId: number,
    @Body(ValidationPipe) createDto: CreateItemRequestDto,
  ): Promise<CreateItemResponseDto | any> {
    try {
      const userId = req.user?.id;
       
      if(!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not found');
      }

      const result = await this.itemService.createItem(
        locationId,
        userId,
        req.user?.roles || [],
        createDto,
      );

      return ResponseHelper.success(
        result,
        'Item created successfully',
      );
    } catch (error) {
      console.error('Error in createItem controller:', error);

      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Error in createItem controller:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to create item',
      );
    }

  }

  @Put('items/:id/stock')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async updateItemStock(
    @Req() req: any,
    @Param('id', ParseIntPipe) itemId: number,
    @LocationId() locationId: number,
    @Body(ValidationPipe) dto: UpdateItemStockRequestDto,
  ) {
    const stock = await this.itemService.updateItemStock(
      itemId,
      locationId,
      req.user?.roles || [],
      dto,
    );
    return ResponseHelper.success(stock, 'Item stock updated successfully');
  }

  @Put('items/:id')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async updateItem(
    @Req() req: any,
    @Param('id') id: number,
    @LocationId() locationId: number,
    @Body(ValidationPipe) updateDto: UpdateItemRequestDto,
  ): Promise<CreateItemResponseDto | any> {
    try {
      const userId = req.user?.id;
      if(!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not found');
      }

      const result = await this.itemService.updateItem(
        id,
        locationId,
        userId,
        req.user?.roles || [],
        updateDto,
      );

      return ResponseHelper.success(
        result,
        'Item updated successfully',
      );
    } catch (error) {
      console.error('Error in updateItem controller:', error);

      if (error.status === 403) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }

      if (error instanceof Error && error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (
        error.message?.includes('UPC code') ||
        error.message?.includes('Invalid taxStatusId') ||
        error.message?.includes('cannot be modified from Backend') ||
        error.message?.includes('Validation')
      ) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to update item',
      );
    }
  }

  @Post('items/import')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async importItems(
    @Req() req: any,
    @LocationId() locationId: number,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    importDto: ImportItemsRequestDto,
  ): Promise<any> {
    try {
      const result = await this.itemService.importItems(
        locationId,
        req.user?.roles || [],
        importDto,
      );

      return ResponseHelper.success(result, 'Item import completed');
    } catch (error) {
      console.error('Error in importItems controller:', error);

      if (error.status === 403) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }

      if (error.status === 400) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to import items',
      );
    }
  }

  @Delete('items/:id')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async deleteItem(
    @Req() req: any,
    @Param('id') id: number,
    @LocationId() locationId: number,
  ): Promise<any> {
    try {
      const result = await this.itemService.deleteItem(
        id,
        locationId,
        req.user?.roles || [],
      );

      return ResponseHelper.success(result, 'Item deleted successfully');
    } catch (error) {
      console.error('Error in deleteItem controller:', error);

      if (error.status === 403) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }

      if (error instanceof Error && error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (
        error.message?.includes('cannot be modified from Backend') ||
        error.status === 400
      ) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to delete item',
      );
    }
  }


}


