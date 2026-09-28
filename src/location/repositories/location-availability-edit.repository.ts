import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocationAvailability } from '../entities/location-availability.entity';

@Injectable()
export class LocationAvailabilityEditRepository {
  constructor(
    @InjectRepository(LocationAvailability)
    private readonly locationAvailabilityRepository: Repository<LocationAvailability>,
  ) {}

  /**
   * Find one non-deleted availability by locationId, day, and type.
   */
  async findAvailabilityByDayType(
    locationId: number,
    day: number,
    type: number,
  ){
    return await this.locationAvailabilityRepository.findOne({
      where: {
        locationId,
        day,
        type,
        isDeleted: false,
      },
    });
  }

  /**
   * Find one non-deleted availability by id and locationId.
   */
  async findAvailabilityByIdAndLocation(
    id: number,
    locationId: number,
  ){
    return await this.locationAvailabilityRepository.findOne({
      where: { id, locationId, isDeleted: false },
    });
  }

  /**
   * Create a new availability record.
   */
  async createAvailability(
    locationId: number,
    day: number,
    type: number,
    fromTime: string,
    toTime: string,
  ): Promise<LocationAvailability> {
    try {
      const model = this.locationAvailabilityRepository.create({
        locationId,
        day,
        type,
        fromTime,
        toTime,
        isDeleted: false,
      });
      return await this.locationAvailabilityRepository.save(model);
    } catch (error) {
      console.error(
        'Error in LocationAvailabilityEditRepository.createAvailability:',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to create location availability',
      );
    }
  }

  /**
   * Update fromTime and toTime for an availability record.
   */
  async updateAvailability(
    id: number,
    fromTime: string,
    toTime: string,
  ): Promise<boolean> {
    try {
      const result = await this.locationAvailabilityRepository.update(id, {
        fromTime,
        toTime,
      });
      return (result.affected ?? 0) > 0;
    } catch (error) {
      console.error(
        'Error in LocationAvailabilityEditRepository.updateTimes:',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to update location availability',
      );
    }
  }

  /**
   * Soft-delete an availability record by setting isDeleted to true.
   */
  async deleteAvailability(id: number): Promise<void> {
    try {
      await this.locationAvailabilityRepository.update(id, {
        isDeleted: true,
      });
    } catch (error) {
      console.error(
        'Error in LocationAvailabilityEditRepository.softDelete:',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to delete location availability',
      );
    }
  }
}
