import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import {
  LocationCategoryRoyaltyResponseDto,
  UpdateLocationCategoryRoyaltiesRequestDto,
} from '../dto/location-category-royalty.dto';
import { ItemCategory } from '../../item/entities/item-category.entity';
import { LocationCategoryRoyaltyRepository } from '../repositories/location-category-royalty.repository';

@Injectable()
export class LocationCategoryRoyaltyService {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly repository: LocationCategoryRoyaltyRepository,
  ) {}

  async getRates(
    locationId: number,
  ): Promise<LocationCategoryRoyaltyResponseDto[]> {
    const rows = await this.repository.findAllForLocation(locationId);
    return rows.map((row) => ({
      categoryId: Number(row.categoryId),
      categoryName: row.categoryName,
      royality: Number(row.royality || 0),
      advertisement: Number(row.advertisement || 0),
      isLesson: Number(row.categoryId) === ItemCategory.CATEGORY_LESSON,
    }));
  }

  async updateRates(
    locationId: number,
    dto: UpdateLocationCategoryRoyaltiesRequestDto,
    userId: number,
  ): Promise<LocationCategoryRoyaltyResponseDto[]> {
    const categoryIds = dto.rates.map((rate) => rate.categoryId);
    if (new Set(categoryIds).size !== categoryIds.length) {
      throw new BadRequestException(
        'Each item category can be submitted only once',
      );
    }

    await this.entityManager.transaction(async (manager) => {
      if (manager.queryRunner) {
        manager.queryRunner.data = {
          ...(manager.queryRunner.data ?? {}),
          currentUserId: userId,
        };
      }
      await this.repository.saveRates(locationId, dto.rates, userId, manager);
    });

    return this.getRates(locationId);
  }
}
