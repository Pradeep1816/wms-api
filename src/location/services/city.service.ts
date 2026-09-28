import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CityRepository } from '../repositories/city.repository';
import { CityTransformationService } from './transformations/city-transformations.service';
import { CityRequestDto } from '../dto/city-request.dto';
import { CitiesListResponseDto } from '../dto/city-response.dto';
import { CreateCityRequestDto } from '../dto/create-city-request.dto';
import { CreateCityResponseDto } from '../dto/create-city-response.dto';
import { plainToInstance } from 'class-transformer';
import { formatDate } from 'src/utils/date-utils';
import { UpdateCityRequestDto } from '../dto/update-city-request.dto';
import { UpdateCityResponseDto } from '../dto/update-city-response.dto';
import { DeleteCityResponseDto } from '../dto/delete-city-response.dto';


@Injectable()
export class CityService {
  constructor(
    private readonly cityRepo: CityRepository,
    private readonly transformService: CityTransformationService,
  ) {}

  async getCities(query: CityRequestDto): Promise<CitiesListResponseDto> {
    const {
      name,
      province,
      page,
      limit,
      sort ,
      order,
    } = query;


    const { items, total } = await this.cityRepo.findCities(
      name,
      province,
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

 async createCity(
  userId: number,
  createDto: CreateCityRequestDto,
): Promise<CreateCityResponseDto | any> {
  try {


    const city = await this.cityRepo.createCity(
      createDto,
      userId,
    );

  
    const response = plainToInstance(CreateCityResponseDto, city, {
      excludeExtraneousValues: true,
    });

    
    response.createdOn = formatDate(city.createdOn);

    return response;

  } catch (error) {
    console.error('Error in createCity service:', error);

    if (error instanceof NotFoundException || error instanceof BadRequestException) {
      throw error; 
    }

    throw new BadRequestException('Failed to create city');
  }
}

async updateCity(
  id: number,
  userId: number,
  updateDto: UpdateCityRequestDto,
): Promise<UpdateCityResponseDto | any> {
  try {
   
    const updatedCity = await this.cityRepo.updateCity(
      id,
      updateDto,
      userId,
    );

  
    const response = plainToInstance(UpdateCityResponseDto, updatedCity, {
      excludeExtraneousValues: true,
    });

 
    response.updatedOn = formatDate(updatedCity.updatedOn);

    return response;
  } catch (error) {
    console.error('Error in updateCity service:', error);

    if (
      error instanceof NotFoundException ||
      error instanceof BadRequestException
    ) {
      throw error;
    }

    throw new BadRequestException('Failed to update city');
  }
}
async deleteCity(
  id: number,
  userId: number,
): Promise<DeleteCityResponseDto> {
  try {

    if (!id || id <= 0) {
      throw new BadRequestException('City id is required');
    }
    const deletedResult = await this.cityRepo.deleteCity(id, userId);

    if (!deletedResult) {
      throw new BadRequestException('Failed to delete city');
    }

    const response = plainToInstance(DeleteCityResponseDto, deletedResult, {
      excludeExtraneousValues: true,
    });

    response.deletedOn = formatDate(deletedResult.deletedOn);

    return response;

  } catch (error) {
    console.error('Error in deleteCity service:', error);

    if (
      error instanceof NotFoundException ||
      error instanceof BadRequestException
    ) {
      throw error;
    }

    throw new BadRequestException('Failed to delete city');
  }
}


}
