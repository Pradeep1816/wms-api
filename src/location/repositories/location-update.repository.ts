import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Not, Repository } from 'typeorm';
import { Location } from '../entities/location.entity';
import { LocationDebt } from '../entities/location-debt.entity';

@Injectable()
export class LocationUpdateRepository {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(LocationDebt)
    private readonly locationDebtRepository: Repository<LocationDebt>,
  ) {}

  /**
   * Find location by id (no isDeleted filter so caller can decide).
   */
  async findLocationById(id: number, manager?: EntityManager): Promise<Location | null> {
    const repo = manager ? manager.getRepository(Location) : this.locationRepository;
    return repo.findOne({ where: { id } });
  }

  /**
   * Check if an email is used by another (non-deleted) location.
   */
  async isEmailUsedByAnother(
    email: string,
    currentLocationId: number,
    manager?: EntityManager,
  ): Promise<boolean> {
    const repo = manager ? manager.getRepository(Location) : this.locationRepository;
    const existing = await repo.findOne({
      where: {
        email: email.trim().toLowerCase(),
        isDeleted: false,
        id: Not(currentLocationId),
      },
      select: { id: true },
    });
    return !!existing;
  }

  /**
   * Persist location changes.
   */
  async saveLocation(location: Location, manager?: EntityManager): Promise<Location> {
    const repo = manager ? manager.getRepository(Location) : this.locationRepository;
    return repo.save(location);
  }

  /**
   * Find single debt row by location and type.
   */
  async findDebtByType(
    locationId: number,
    type: number,
    manager?: EntityManager,
  ): Promise<LocationDebt | null> {
    const repo = manager ? manager.getRepository(LocationDebt) : this.locationDebtRepository;
    return repo.findOne({
      where: {
        locationId,
        type,
      },
    });
  }

  /**
   * Persist debt row changes.
   */
  async saveDebt(debt: LocationDebt, manager?: EntityManager): Promise<LocationDebt> {
    const repo = manager ? manager.getRepository(LocationDebt) : this.locationDebtRepository;
    return repo.save(debt);
  }
}

