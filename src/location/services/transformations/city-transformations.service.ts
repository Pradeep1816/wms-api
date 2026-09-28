import { Injectable } from '@nestjs/common';
import { CityResponseDto } from 'src/location/dto/city-response.dto';
import { City } from 'src/location/entities/city.entity';



@Injectable()
export class CityTransformationService {
  
  transformRow(city: City): CityResponseDto {
    return {
      id: city.id,
      name: city.name,
      province: city.province?.name, 
    };
  }

  transformRows(cities: City[]): CityResponseDto[] {
    return cities.map(c => this.transformRow(c));
  }
}
