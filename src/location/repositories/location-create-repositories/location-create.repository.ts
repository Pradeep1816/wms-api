import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { Location } from '../../entities/location.entity';

export interface LocationRowInsert {
  name: string;
  legalCorporateName: string | null;
  address: string;
  phoneNumber: string;
  email: string;
  cityId: number;
  provinceId: number;
  postalCode: string;
  countryId: number;
  slug: string;
  conversionDate?: Date;
  isDeleted: boolean;
  createdByUserId: number;
  updatedByUserId: number;
  isEnabledCron: boolean;
}

@Injectable()
export class LocationCreateRepository {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
  ) {}

  /**
   * Check if email is already used by another location.
   */
  async isEmailUsed(email: string, manager?: EntityManager): Promise<boolean> {
    const repo = manager ? manager.getRepository(Location) : this.locationRepository;
    const existing = await repo.findOne({
      where: { email: email.trim().toLowerCase(), isDeleted: false },
      select: { id: true },
    });
    return !!existing;
  }

  /**
   * Insert location row and return the new location entity (with id).
   */
  async insertLocation(row: LocationRowInsert, manager?: EntityManager): Promise<Location> {
    const repo = manager ? manager.getRepository(Location) : this.locationRepository;
    const partial: Record<string, unknown> = {
      name: row.name,
      legalCorporateName: row.legalCorporateName,
      address: row.address,
      phoneNumber: row.phoneNumber,
      email: row.email,
      cityId: row.cityId,
      provinceId: row.provinceId,
      postalCode: row.postalCode,
      countryId: row.countryId,
      slug: row.slug,
      isDeleted: row.isDeleted,
      createdByUserId: row.createdByUserId,
      updatedByUserId: row.updatedByUserId,
      isEnabledCron: row.isEnabledCron,
    };
    if (row.conversionDate != null) {
      partial.conversionDate = row.conversionDate;
    }
    const location = repo.create(partial as Partial<Location>);
    return (await repo.save(location)) as Location;
  }
}
