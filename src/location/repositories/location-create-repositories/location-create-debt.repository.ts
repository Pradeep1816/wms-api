import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { LocationDebt } from '../../entities/location-debt.entity';

/**
 * Step 4: Create royalty and advertisement (location debt).
 * Insert 2 rows: type 1 = royalty, type 2 = advertisement.
 */
@Injectable()
export class LocationCreateDebtRepository {
  constructor(
    @InjectRepository(LocationDebt)
    private readonly locationDebtRepository: Repository<LocationDebt>,
  ) {}

  async insertRoyaltyAndAdvertisement(
    locationId: number,
    royaltyValue: number,
    advertisementValue: number,
    manager?: EntityManager,
  ): Promise<LocationDebt[]> {
    const repo = manager
      ? manager.getRepository(LocationDebt)
      : this.locationDebtRepository;
    const rows = [
      repo.create({
        locationId,
        type: LocationDebt.TYPE_ROYALTY,
        value: royaltyValue,
      }),
      repo.create({
        locationId,
        type: LocationDebt.TYPE_ADVERTISEMENT,
        value: advertisementValue,
        advertisementBaseline: advertisementValue,
      }),
    ];
    const saved = await repo.save(rows);
    await repo.manager.query(
      `
      INSERT INTO location_category_royalty (locationId, itemCategoryId, royality, advertisement)
      SELECT ?, id, 0, ? FROM item_category WHERE isDeleted = 0 AND id NOT IN (1, 4)
    `,
      [locationId, advertisementValue],
    );
    return saved;
  }
}
