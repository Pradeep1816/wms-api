import { Injectable } from '@nestjs/common';
import { LocationGeodataResponseDto } from '../dto/location-geodata.dto';
import { CityRepository } from '../repositories/city.repository';
import { ProvinceRepository } from '../repositories/province.repository';
import { CountryRepository } from '../repositories/country.repository';

@Injectable()
export class LocationGeodataService {
  constructor(
    private readonly cityRepository: CityRepository,
    private readonly provinceRepository: ProvinceRepository,
    private readonly countryRepository: CountryRepository,
  ) {}

  async getGeodataByType(type?: string): Promise<LocationGeodataResponseDto> {
    const typeMap = new Map([
      ['city', this.getCitiesOnly.bind(this)],
      ['province', this.getProvincesOnly.bind(this)],
      ['country', this.getCountriesOnly.bind(this)],
      ['all', this.getAllGeodata.bind(this)],
    ]);

    const handler = typeMap.get(type || 'all');
    return await handler();
  }

  async getAllGeodata(): Promise<LocationGeodataResponseDto> {
    try {
      const [cities, provinces, countries] = await Promise.all([
        this.cityRepository.findGeodata(),
        this.provinceRepository.findGeodata(),
        this.countryRepository.findGeodata(),
      ]);

      return {
        city: cities,
        province: provinces,
        country: countries,
      };
    } catch (error) {
      throw new Error(`Failed to fetch all geodata: ${error.message}`);
    }
  }

  async getCitiesOnly(): Promise<LocationGeodataResponseDto> {
    try {
      const cities = await this.cityRepository.findGeodata();
      return { city: cities };
    } catch (error) {
      throw new Error(`Failed to fetch cities: ${error.message}`);
    }
  }

  async getProvincesOnly(): Promise<LocationGeodataResponseDto> {
    try {
      const provinces = await this.provinceRepository.findGeodata();
      return { province: provinces };
    } catch (error) {
      throw new Error(`Failed to fetch provinces: ${error.message}`);
    }
  }

  async getCountriesOnly(): Promise<LocationGeodataResponseDto> {
    try {
      const countries = await this.countryRepository.findGeodata();
      return { country: countries };
    } catch (error) {
      throw new Error(`Failed to fetch countries: ${error.message}`);
    }
  }
}
