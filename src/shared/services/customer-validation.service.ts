import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Location } from '../../location/entities/location.entity';
import { UserLocation } from '../../user/entities/user-location.entity';

@Injectable()
export class CustomerValidationService {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(UserLocation)
    private readonly userLocationRepository: Repository<UserLocation>,
  ) {}

  /**
   * Validate location exists and return location ID
   */
  async validateLocationExists(locationSlug: string): Promise<{ id: number; name: string }> {
    try {
      const location = await this.locationRepository.findOne({
        where: { slug: locationSlug }
      });
      
      if (!location) {
        throw new NotFoundException(`Location not found: ${locationSlug}`);
      }
      
      return { id: location.id, name: locationSlug };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new NotFoundException(`Location not found: ${locationSlug}`);
    }
  }

  /**
   * Validate customer exists in the specific location
   * Checks both that the customer exists and is associated with the location
   */
  async validateCustomerExists(customerId: number, locationId:number): Promise<boolean> {
    try {
      // Check if customer exists and is associated with this specific location
      const userLocation = await this.userLocationRepository.findOne({
        where: { 
          userId: customerId,
          locationId: locationId,
        }
      });
      
      return !!userLocation;
    } catch (error) {
      console.error('Error validating customer exists:', error);
      return false;
    }
  }

  /**
   * Validate both location and customer exist
   * Returns location ID for convenience
   */
  async validateLocationAndCustomer(locationSlug: string, customerId: number): Promise<{ locationId: number; customerId: number }> {
    const location = await this.validateLocationExists(locationSlug);

    const isCustomer = await this.validateCustomerExists(customerId, location.id);
    
    if (!isCustomer) {
      throw new NotFoundException(`Customer with ID ${customerId} not found in location ${locationSlug}`);
    }

    return { locationId: location.id, customerId };
  }
}
