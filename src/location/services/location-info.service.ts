import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { LocationDetailsRepository } from '../repositories/location-info.repository';
import { LocationDetailsTransformationService } from './transformations/location-info-transformation.service';
import { LocationDetailsDataDto } from '../dto/location-info-response.dto';

@Injectable()
export class LocationDetailsService {
  constructor(
    private readonly locationDetailsRepository: LocationDetailsRepository,
    private readonly transformationService: LocationDetailsTransformationService,
  ) {}


   // Get location details by slug

  async getLocationDetails(
    locationId: number,
    locationSlug: string,
  ): Promise<LocationDetailsDataDto> {
    try {
    
  // Get location with relationships
      const location = await this.locationDetailsRepository.findLocationBySlug(
        locationSlug,
      );

      if (!location) {
        throw new NotFoundException(
          `Location with slug '${locationSlug}' not found`,
        );
      }

      // Get royalty and advertisement values in parallel
      const [royalty, advertisement] = await Promise.all([
        this.locationDetailsRepository.getRoyaltyValue(locationId),
        this.locationDetailsRepository.getAdvertisementValue(locationId),
      ]);

      // Transform to DTO
      return this.transformationService.transformToDataDto(
        location,
        royalty,
        advertisement,
      );
    } catch (error) {
      console.error('Error in getLocationDetails service:', error);

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to retrieve location details: ${error.message}`,
      );
    }
  }
}
