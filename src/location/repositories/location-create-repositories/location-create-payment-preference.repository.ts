import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { LocationPaymentPreference } from '../../entities/location-payment-preference.entity';

/**
 * Step 5: Create payment preference for location.
 * Insert 1 row: isPreferredPaymentEnabled = 0 (disabled by default).
 */
@Injectable()
export class LocationCreatePaymentPreferenceRepository {
  constructor(
    @InjectRepository(LocationPaymentPreference)
    private readonly locationPaymentPreferenceRepository: Repository<LocationPaymentPreference>,
  ) {}

  async insertOne(
    locationId: number,
    userId: number,
    manager?: EntityManager,
  ): Promise<LocationPaymentPreference> {
    const repo = manager
      ? manager.getRepository(LocationPaymentPreference)
      : this.locationPaymentPreferenceRepository;
    const entity = repo.create({
      locationId,
      isPreferredPaymentEnabled: 0,
      createdByUserId: userId,
      updatedByUserId: userId,
    });
    return repo.save(entity);
  }
}
