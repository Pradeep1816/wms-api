import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ProvinceRepository } from '../repositories/province.repository';
import { ProvinceTransformationService } from './transformations/province-transformation.service';
import { ProvinceRequestDto } from '../dto/province-request.dto';
import { ProvincesListResponseDto } from '../dto/province-response.dto';
import { CreateProvinceRequestDto } from '../dto/create-province-request.dto';
import { CreateProvinceResponseDto } from '../dto/create-province-response.dto';
import { plainToInstance } from 'class-transformer';
import { formatDate } from 'src/utils/date-utils';
import { UpdateProvinceRequestDto } from '../dto/update-province-request.dto';
import { UpdateProvinceResponseDto } from '../dto/update-province-response.dto';
import { DeleteProvinceResponseDto } from '../dto/delete-province-response.dto';


@Injectable()
export class ProvinceService {
  constructor(
    private readonly provinceRepo: ProvinceRepository,
    private readonly transformService: ProvinceTransformationService,
  ) {}

  async getProvinces(query: ProvinceRequestDto): Promise<ProvincesListResponseDto> {
    const {
      name,
      page,
      limit,
      sort,
      order,
    } = query;

    const { items, total } = await this.provinceRepo.findProvinces(
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

async createProvince(
  userId:number,
  createDto:CreateProvinceRequestDto):Promise<CreateProvinceResponseDto|any>{
    try{
      const province = await this.provinceRepo.createProvince(
        createDto,
        userId
      );

      const response = plainToInstance(CreateProvinceResponseDto,province,{
        excludeExtraneousValues:true,
      });
      response.createdOn = formatDate(province.createdOn);

      return response;

      

    }
    catch(error){
      console.error('Error in createProvince service:', error);

      if(error instanceof NotFoundException|| error instanceof BadRequestException){
        throw error;
      }

      throw new BadRequestException('Failed to create a Province');

    }

}

async updateProvince(
  id: number,
  userId: number,
  updateDto: UpdateProvinceRequestDto,
): Promise<UpdateProvinceResponseDto | any> {
  try {

    const updatedProvince = await this.provinceRepo.updateProvince(
      id,
      updateDto,
      userId,
    );

    const response = plainToInstance(UpdateProvinceResponseDto, updatedProvince, {
      excludeExtraneousValues: true,
    });

    response.updatedOn = formatDate(updatedProvince.updatedOn);

    return response;

  } catch (error) {
    console.error('Error in updateProvince service:', error);

    if (
      error instanceof NotFoundException ||
      error instanceof BadRequestException
    ) {
      throw error;
    }

    throw new BadRequestException('Failed to update province');
  }
}

async deleteProvince(
  id: number,
  userId: number,
): Promise<DeleteProvinceResponseDto | any> {
  try {

    const deletedResult = await this.provinceRepo.deleteProvince(
      id,
      userId,
    );

    if (!deletedResult || !deletedResult.id) {
      throw new BadRequestException('Failed to delete province');
    }

    const response = plainToInstance(DeleteProvinceResponseDto, deletedResult, {
      excludeExtraneousValues: true,
    });

    return response;

  } catch (error) {
    console.error('Error in deleteProvince service:', error);

    if (error instanceof NotFoundException || error instanceof BadRequestException) {
      throw error; 
    }

    throw new BadRequestException('Failed to delete province');
  }
}


}
