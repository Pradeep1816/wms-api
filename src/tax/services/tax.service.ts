import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TaxRepository } from '../repositories/tax.repository';
import { TaxCodeTransformationService } from './transformations/tax-transformation.service';
import { TaxCodeRequestDto } from '../dto/tax-request.dto';
import { TaxCodeListResponseDto } from '../dto/tax-response.dto';
import { CreateTaxCodeRequestDto } from '../dto/create-tax-request.dto';
import { CreateTaxCodeResponseDto } from '../dto/create-tax-response.dto';
import { plainToInstance } from 'class-transformer';
import { formatDate } from 'src/utils/date-utils';
import { UpdateTaxCodeRequestDto } from '../dto/update-tax-request.dto';
import { UpdateTaxCodeResponseDto } from '../dto/update-tax-response.dto';
import { DeleteTaxCodeResponseDto} from '../dto/delete-tax-response.dto';


@Injectable()
export class TaxService {
  constructor(
    private readonly taxRepo: TaxRepository,
    private readonly transformService: TaxCodeTransformationService,
  ) {}

  async getTaxCodes(
    query: TaxCodeRequestDto,
  ): Promise<TaxCodeListResponseDto> {
    const { page, limit, sort, order } = query;

    
    const { items, total } = await this.taxRepo.findTaxCodes(
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


  async createTaxCode(
  userId: number,
  createDto: CreateTaxCodeRequestDto,
): Promise<CreateTaxCodeResponseDto | any> {
  try {
    const taxCode = await this.taxRepo.createTaxCode(
      createDto,
      userId,
    );

    const response = plainToInstance(CreateTaxCodeResponseDto, taxCode, {
      excludeExtraneousValues: true,
    });

    
    response.startDate = formatDate(taxCode.startDate);


    response.createdByUserId = userId;

    return response;

  } catch (error) {
    console.error('Error in createTaxCode service:', error);

    throw new BadRequestException('Failed to create tax code');
  }
}

async updateTaxCode(
  id: number,
  userId: number,
  updateDto: UpdateTaxCodeRequestDto,
): Promise<UpdateTaxCodeResponseDto| any> {
  try {
    const updatedTaxCode: any = await this.taxRepo.updateTaxCode(
      id,
      updateDto,
      userId,
    );

    const response = plainToInstance(UpdateTaxCodeResponseDto, updatedTaxCode, {
      excludeExtraneousValues: true,
    });

    response.startDate = formatDate(updatedTaxCode.startDate);
    response.updatedByUserId = userId;

    return response;

  } catch (error) {
    console.error('Error in updateTaxCode service:', error);

    if (
      error instanceof NotFoundException ||
      error instanceof BadRequestException
    ) {
      throw error;
    }

    throw new BadRequestException('Failed to update tax code');
  }
}

async deleteTaxCode(
  id:number,
  userId:number
):Promise<DeleteTaxCodeResponseDto|any>{
  try{
    const deletedResult = await this.taxRepo.deleteTaxCode(
      id,
      userId
    );

    if(!deletedResult || !deletedResult.id){
      throw new BadRequestException('Failed to delete TaxCode');
    }

    const response = plainToInstance(DeleteTaxCodeResponseDto,deletedResult,{
      excludeExtraneousValues:true,
    });
    return response;

  }catch(error){
    console.error('Error in deleteTaxCode service:', error);

    if(error instanceof NotFoundException|| error instanceof BadRequestException){
     throw error;
    }
      throw new BadRequestException('Failed to delete TaxCode')
  }
}

}