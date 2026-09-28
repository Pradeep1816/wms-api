import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { Location } from '../entities/location.entity';
import { Repository } from 'typeorm';

/**
 * Location soft-delete service.
 * Sets location.isDeleted = true only. No cascade, no other tables touched.
 */
@Injectable()
export class LocationDeleteService {
  constructor(
    @InjectRepository(Location)
    private readonly locationRespo: Repository<Location>
  ) { }

  /**
   * Soft delete a location by id.
   * Idempotent: if already deleted, no-op. 404 if id does not exist.
   */
  async deleteLocation(locationId: number): Promise<any> {

    const location = await this.locationRespo.findOne({
      where: {
        id: locationId,
        isDeleted: false
      },
      select: {
        id: true,
        isDeleted: true
      }
    })

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    await this.locationRespo.update(location.id, {
      isDeleted: true
    });
    return location;
  }
}
