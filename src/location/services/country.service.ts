import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CountryRepository } from '../repositories/country.repository';
import { CountryTransformationService } from './transformations/country-transformation.service';
import { CountryRequestDto } from '../dto/country-request.dto';
import { CountriesListResponseDto } from '../dto/country-response.dto';
import { UpdateCountryRequestDto } from '../dto/update-country-request.dto';
import { UpdateCountryResponseDto } from '../dto/update-country-response.dto';
import { CreateCountryRequestDto } from '../dto/create-country-request.dto';
import { CreateCountryResponseDto } from '../dto/create-country-response.dto';
import { plainToInstance } from 'class-transformer';
import { formatDate } from 'src/utils/date-utils';

@Injectable()
export class CountryService {
  constructor(
    private readonly countryRepo: CountryRepository,
    private readonly transformService: CountryTransformationService,
  ) {}

  async getCountries(
    query: CountryRequestDto,
  ): Promise<CountriesListResponseDto> {
    const { name, page, limit, sort, order } = query;

 
    const { items, total } = await this.countryRepo.findCountries(
      name,
      page,
      limit,
      sort,
      order,
    );

   
    const body = this.transformService.transformRows(items);


    const pagination = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };

    return {
      body,
      pagination,
    };
  }

  async updateCountry(
  id: number,
  userId: number,
  updateDto: UpdateCountryRequestDto,
): Promise<UpdateCountryResponseDto|any> {
  try {
 
    if (!updateDto.name || updateDto.name.trim() === '') {
      throw new BadRequestException('Country name is required');
    }

 
    const updatedCountry = await this.countryRepo.updateCountry(
      id,
      updateDto.name,
      userId,
    );


    const response = plainToInstance(UpdateCountryResponseDto, updatedCountry, {
      excludeExtraneousValues: true,
    });

    response.updatedOn = formatDate(updatedCountry.updatedOn);

    return response;

   


  }
 catch (error) {
    console.error('Error in updateCountry service:', error);

    if (error instanceof NotFoundException || error instanceof BadRequestException) {
      throw error;
    }

    throw new BadRequestException('Failed to update country');
  }

  }


  async createCountry(
  userId: number,
  createDto: CreateCountryRequestDto,
): Promise<CreateCountryResponseDto> {
  try {

    if (!createDto.name || createDto.name.trim() === '') {
      throw new BadRequestException('Country name is required');
    }

    const country = await this.countryRepo.createCountry(createDto.name, userId);

 
    const response = plainToInstance(CreateCountryResponseDto, country, {
      excludeExtraneousValues: true,
    });


    response.createdOn = formatDate(country.createdOn);

    return response;

  } catch (error) {
    console.error('Error in updateCountry service:', error);

    if (error instanceof NotFoundException || error instanceof BadRequestException) {
      throw error;
    }

    throw new BadRequestException('Failed to create country');
  }
}

async deleteCountry(
  id: number,
  userId: number,
): Promise<any> {
  try {
    if (!id || id <= 0) {
      throw new BadRequestException('Country id is required');
    }


    const deletedResult = await this.countryRepo.deleteCountry(id, userId);

    if (!deletedResult || !deletedResult.deleted) {
      throw new BadRequestException('Failed to delete country');
    }

  
    return {
      id: deletedResult.id,
      name: deletedResult.name,
      deletedOn: formatDate(new Date()),
      deletedByUserId: userId,
    };

  } catch (error) {
    console.error('Error in deleteCountry service:', error);

    if (error instanceof NotFoundException || error instanceof BadRequestException) {
      throw error;
    }

    throw new BadRequestException('Failed to delete country');
  }
}

}
