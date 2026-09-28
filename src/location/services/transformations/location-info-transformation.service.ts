import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Location } from '../../entities/location.entity';
import {
  LocationDetailsBodyDto,
  LocationDetailsDataDto,
} from '../../dto/location-info-response.dto';
import { formatDate } from '../../../utils/date-utils';

@Injectable()
export class LocationDetailsTransformationService {
 // Transform location entity to LocationDetailsBodyDto
  transformToDetailsBody(
    location: Location,
    royalty: number,
    advertisement: number,
  ): LocationDetailsBodyDto {
    const bodyData = {
      id: location.id,
      name: location.name,
      legalCorporateName: location.legalCorporateName || '',
      slug: location.slug,
      details: {
        email: location.email || '',
        phone: location.phoneNumber || '',
        royalty: royalty,
        advertisement: advertisement,
        conversionDate: location.conversionDate
          ? formatDate(location.conversionDate)
          : null,
      },
      address: {
        address: location.address || '',
        city: location.city?.name || '',
        province: location.province?.name || '',
        country: location.country?.name || '',
        postalCode: location.postalCode || '',
      },
      hstRegistrationNo: location.hstRegistrationNo || '',
    };

    return plainToInstance(LocationDetailsBodyDto, bodyData, {
      excludeExtraneousValues: true,
    });
  }

  //Transform location data to LocationDetailsDataDto
  
  transformToDataDto(
    location: Location,
    royalty: number,
    advertisement: number,
  ): LocationDetailsDataDto {
    const bodyDto = this.transformToDetailsBody(location, royalty, advertisement);

    const dataDto = {
      body: bodyDto,
    };

    return plainToInstance(LocationDetailsDataDto, dataDto, {
      excludeExtraneousValues: true,
    });
  }
}
