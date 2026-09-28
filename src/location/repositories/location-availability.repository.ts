import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { LocationAvailability } from '../entities/location-availability.entity';

@Injectable()
export class LocationAvailabilityRepository {
  constructor(
    @InjectRepository(LocationAvailability)
    private readonly locationAvailabilityRepository: Repository<LocationAvailability>,
  ) {}

  private getRepo(manager?: EntityManager): Repository<LocationAvailability> {
    return manager
      ? manager.getRepository(LocationAvailability)
      : this.locationAvailabilityRepository;
  }

  /**
   * Find all non-deleted location availabilities for a location and type.
   * Pass manager to run inside a transaction.
   */
  async findByLocationAndType(
    locationId: number,
    type: number,
    manager?: EntityManager,
  ): Promise<LocationAvailability[]> {
    try {
      const repo = this.getRepo(manager);
      return await repo
        .createQueryBuilder('locationAvailability')
        .where('locationAvailability.locationId = :locationId', { locationId })
        .andWhere('locationAvailability.type = :type', { type })
        .andWhere('locationAvailability.isDeleted = :isDeleted', { isDeleted: false })
        .orderBy('locationAvailability.day', 'ASC')
        .getMany();
    } catch (error) {
      console.error('Error in LocationAvailabilityRepository.findByLocationAndType:', error);
      throw new InternalServerErrorException('Failed to retrieve location availability');
    }
  }

  // Hard-delete all location_availability rows for a location and type
  async deleteByLocationAndType(
    locationId: number,
    type: number,
    manager?: EntityManager,
  ): Promise<void> {
    try {
      const repo = this.getRepo(manager);
      await repo.delete({
        locationId,
        type,
      });
    } catch (error) {
      console.error('Error in LocationAvailabilityRepository.deleteByLocationAndType:', error);
      throw new InternalServerErrorException('Failed to delete location availability');
    }
  }

  // Insert multiple location availability rows (one-by-one; use bulkInsert for many rows)
  async saveMany(
    entities: Partial<LocationAvailability>[],
    manager?: EntityManager,
  ): Promise<LocationAvailability[]> {
    try {
      if (entities.length === 0) {
        return [];
      }
      const repo = this.getRepo(manager);
      const toInsert = entities.map((e) => repo.create(e));
      return await repo.save(toInsert);
    } catch (error) {
      console.error('Error in LocationAvailabilityRepository.saveMany:', error);
      throw new InternalServerErrorException('Failed to save location availability');
    }
  }

  /**
   * Bulk insert many rows in a single INSERT query (faster than saveMany for copy-availability).
   */
  async bulkInsert(
    entities: Partial<LocationAvailability>[],
    manager?: EntityManager,
  ): Promise<void> {
    if (entities.length === 0) {
      return;
    }
    try {
      const repo = this.getRepo(manager);
      const qb = (manager ?? repo.manager).createQueryBuilder();
      await qb
        .insert()
        .into(LocationAvailability)
        .values(entities)
        .execute();
    } catch (error) {
      console.error('Error in LocationAvailabilityRepository.bulkInsert:', error);
      throw new InternalServerErrorException('Failed to bulk insert location availability');
    }
  }
}
