import { Injectable } from '@nestjs/common';
import { Country } from 'src/location/entities/country.entity';
import { CountryResponseDto } from '../../dto/country-response.dto';

@Injectable()
export class CountryTransformationService {
  
  transformRow(country: Country): CountryResponseDto {
    return {
      id: country.id,
      name: country.name,
    };
  }

  transformRows(countries: Country[]): CountryResponseDto[] {
    return countries.map(c => this.transformRow(c));
  }
}
