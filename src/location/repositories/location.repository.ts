import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from '../entities/location.entity';
import { LocationAvailability } from '../entities/location-availability.entity';

@Injectable()
export class LocationRepository {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(LocationAvailability)
    private readonly locationAvailabilityRepository: Repository<LocationAvailability>,
  ) {}

  /**
   * Get HST registration number for a specific location ID
   */
  async getLocationDetails(locationId: number): Promise<any> {
    return await this.locationRepository.findOne({
      where: { id: locationId, isDeleted: false },
      relations:['country','province','city'],
    }); 
  }


  async findLocations(
    page: number = 1,
    limit: number = 20,
    sort: string = 'name',
    order: 'ASC' | 'DESC' = 'ASC',
  ) {
    const query = this.locationRepository.createQueryBuilder('location');
  
    query.where('location.isDeleted = :isDeleted', { isDeleted: false });
  
    const sortMapping: Record<string, string> = {
      name: 'location.name',
      address: 'location.address',
      email: 'location.email',
    };
  
    const sortField = sortMapping[sort] ?? 'location.name';
    query.orderBy(sortField, order);
  
    const total = await query.getCount();
  
    const items = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
  
    return { items, total };
  }

  /**
   * Find all location availabilities for a location and type (across all days)
   * Used for calculating minTime and maxTime based on showAll parameter
   */
  async findLocationAvailabilitiesByType(
    locationId: number,
    type: number,
  ): Promise<LocationAvailability[]> {
    try {
      return await this.locationAvailabilityRepository.find({
        where: {
          locationId: locationId,
          type: type,
          isDeleted: false,
        },
      });
    } catch (error) {
      console.error('Error in LocationRepository.findLocationAvailabilitiesByType:', error);
      throw new InternalServerErrorException('Failed to retrieve location availabilities');
    }
  }
}



