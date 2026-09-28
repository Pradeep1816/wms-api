import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ItemCategory } from '../../item/entities/item-category.entity';
import { LocationCategoryRoyaltyRateDto } from '../dto/location-category-royalty.dto';
import { LocationCategoryRoyalty } from '../entities/location-category-royalty.entity';
import { LocationDebt } from '../entities/location-debt.entity';

interface LocationCategoryRoyaltyRawRow {
  categoryId: string | number;
  categoryName: string;
  royality: string | number | null;
  advertisement: string | number | null;
}

@Injectable()
export class LocationCategoryRoyaltyRepository {
  constructor(
    @InjectRepository(ItemCategory)
    private readonly itemCategoryRepository: Repository<ItemCategory>,
  ) {}

  async findAllForLocation(
    locationId: number,
  ): Promise<LocationCategoryRoyaltyRawRow[]> {
    return this.itemCategoryRepository
      .createQueryBuilder('category')
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
      .leftJoin(
        LocationDebt,
        'lessonAdvertisement',
        'lessonAdvertisement.locationId = :locationId AND lessonAdvertisement.type = 2',
        { locationId },
      )
      .select('category.id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect(
        'CASE WHEN category.id = :lessonCategoryId THEN COALESCE(lessonRoyalty.value, 0) ELSE COALESCE(locationRate.royality, 0) END',
        'royality',
      )
      .addSelect(
        'CASE WHEN category.id = 1 THEN COALESCE(lessonAdvertisement.value, 0) ELSE COALESCE(locationRate.advertisement, 0) END',
        'advertisement',
      )
      .where('category.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('category.id <> :openingBalanceCategoryId', {
        openingBalanceCategoryId: ItemCategory.CATEGORY_OPENING_BALANCE,
      })
      .setParameter('lessonCategoryId', ItemCategory.CATEGORY_LESSON)
      .orderBy('category.name', 'ASC')
      .getRawMany<LocationCategoryRoyaltyRawRow>();
  }

  async findActiveCategoryIds(
    categoryIds: number[],
    manager: EntityManager,
  ): Promise<number[]> {
    const rows = await manager
      .getRepository(ItemCategory)
      .createQueryBuilder('category')
      .select('category.id', 'id')
      .where('category.id IN (:...categoryIds)', { categoryIds })
      .andWhere('category.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('category.id <> :openingBalanceCategoryId', {
        openingBalanceCategoryId: ItemCategory.CATEGORY_OPENING_BALANCE,
      })
      .getRawMany<{ id: string | number }>();

    return rows.map((row) => Number(row.id));
  }

  async saveRates(
    locationId: number,
    rates: LocationCategoryRoyaltyRateDto[],
    userId: number,
    manager: EntityManager,
  ): Promise<void> {
    const activeCategoryIds = await this.findActiveCategoryIds(
      rates.map((rate) => rate.categoryId),
      manager,
    );
    if (activeCategoryIds.length !== rates.length) {
      throw new NotFoundException('One or more item categories were not found');
    }

    for (const rate of rates) {
      if (rate.categoryId === ItemCategory.CATEGORY_LESSON) {
        const debtRepository = manager.getRepository(LocationDebt);
        let lessonRoyalty = await debtRepository.findOne({
          where: { locationId, type: LocationDebt.TYPE_ROYALTY },
        });
        if (!lessonRoyalty) {
          lessonRoyalty = debtRepository.create({
            locationId,
            type: LocationDebt.TYPE_ROYALTY,
            value: rate.royality,
          });
        } else {
          lessonRoyalty.value = rate.royality;
        }
        await debtRepository.save(lessonRoyalty);
        if (rate.advertisement !== undefined) {
          let advertisement = await debtRepository.findOne({
            where: { locationId, type: LocationDebt.TYPE_ADVERTISEMENT },
          });
          advertisement ??= debtRepository.create({
            locationId,
            type: LocationDebt.TYPE_ADVERTISEMENT,
            value: 0,
          });
          advertisement.value = rate.advertisement;
          await debtRepository.save(advertisement);
        }
        continue;
      }

      const rateRepository = manager.getRepository(LocationCategoryRoyalty);
      let locationRate = await rateRepository.findOne({
        where: { locationId, itemCategoryId: rate.categoryId },
      });
      if (!locationRate) {
        locationRate = rateRepository.create({
          locationId,
          itemCategoryId: rate.categoryId,
          royality: rate.royality,
          advertisement: rate.advertisement ?? 0,
          createdByUserId: userId,
          updatedByUserId: userId,
        });
      } else {
        locationRate.royality = rate.royality;
        if (rate.advertisement !== undefined)
          locationRate.advertisement = rate.advertisement;
        locationRate.updatedByUserId = userId;
      }
      await rateRepository.save(locationRate);
    }
  }
}
