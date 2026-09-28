import { Injectable } from '@nestjs/common';
import { LocationListResponseDto } from 'src/location/dto/location-list-response.dto';
import { Location } from 'src/location/entities/location.entity';

@Injectable()
export class LocationTransformationService {
  transformRow(location: Location): LocationListResponseDto {
    return {
      id: location.id,
      name: location.name,
      address: location.address,
      email: location.email,
    };
  }

  transformRows(locations: Location[]): LocationListResponseDto[] {
    return locations.map((loc) => this.transformRow(loc));
  }
}
