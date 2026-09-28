import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from '../entities/location.entity';

@Injectable()
export class LocationLegalCorporateNameService {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
  ) {}

  async updateLegalCorporateName(
    locationId: number,
    legalCorporateName: string,
  ): Promise<{ legalCorporateName: string }> {
    const location = await this.locationRepository.findOne({
      where: { id: locationId, isDeleted: false },
    });

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    const normalizedName = legalCorporateName.trim();
    await this.locationRepository.update(locationId, {
      legalCorporateName: normalizedName || null,
    });

    return { legalCorporateName: normalizedName };
  }
}
