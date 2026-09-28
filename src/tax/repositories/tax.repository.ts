import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryRunner, Repository } from 'typeorm';
import { TaxCode } from '../entities/tax-code.entity';
import { TaxTypeTaxStatusAssoc } from '../entities/tax-type-tax-status-assoc.entity';
import { CreateTaxCodeRequestDto } from '../dto/create-tax-request.dto';
import { UpdateTaxCodeRequestDto } from '../dto/update-tax-request.dto';

@Injectable()
export class TaxRepository {
  constructor(
    @InjectRepository(TaxCode)
    private readonly taxCodeRepository: Repository<TaxCode>,
    @InjectRepository(TaxTypeTaxStatusAssoc)
    private readonly taxTypeTaxStatusAssocRepository: Repository<TaxTypeTaxStatusAssoc>,
  ) {}

  // Get tax type ID associated with a tax status ID
// This method combines the lookup of tax type and tax rate
  async getTaxTypeIdByTaxStatusId(taxStatusId: number): Promise<number | null> {
    const taxTypeAssoc = await this.taxTypeTaxStatusAssocRepository.findOne({
      where: { taxStatusId },
    });

    return taxTypeAssoc?.taxTypeId || null;
  }

  // Get tax rate for a given province ID and tax type ID

  async getTaxRateByProvinceAndType(provinceId: number, taxTypeId: number): Promise<number | null> {
    const taxCode = await this.taxCodeRepository
      .createQueryBuilder('taxCode')
      .where('taxCode.province_id = :provinceId', { provinceId })
      .andWhere('taxCode.tax_type_id = :taxTypeId', { taxTypeId })
      .orderBy('taxCode.id', 'DESC')
      .getOne();

    return taxCode?.rate ? Number(taxCode.rate) : null;
  }

 
   // Get tax rate for a given tax status ID and province ID
   // This method combines the lookup of tax type and tax rate
   
  async getTaxRateByTaxStatusAndProvince(taxStatusId: number, provinceId: number): Promise<number | null> {
    // First, find the taxTypeId associated with this taxStatusId
    const taxTypeId = await this.getTaxTypeIdByTaxStatusId(taxStatusId);

    if (!taxTypeId) {
      return null;
    }

    // Get the tax rate for this province and tax type
    const taxRate = await this.getTaxRateByProvinceAndType(provinceId, taxTypeId);
    return taxRate;
    
  }
async findTaxCodes(
  page: number = 1,
  limit: number = 20,
  sort: 'taxName' | 'provinceName' | 'startDate' | 'code' = 'code',
  order?: 'ASC' | 'DESC',
) {
  const query = this.taxCodeRepository
    .createQueryBuilder('taxCode')
    .leftJoinAndSelect('taxCode.taxType', 'taxType')
    .leftJoinAndSelect('taxCode.province', 'province');

  const sortMapping = {
    taxName: 'taxType.name',
    provinceName: 'province.name',
    startDate: 'taxCode.startDate',
    code: 'taxCode.code',
  };


  const sortField = sortMapping[sort];


  query.orderBy(sortField, order);

  const total = await query.getCount();

  const items = await query
    .skip((page - 1) * limit)
    .take(limit)
    .getMany();

  return { items, total };
}

async createTaxCode(
  createDto: CreateTaxCodeRequestDto,
  userId: number,
): Promise<any> {
  const queryRunner = this.taxCodeRepository.manager.connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const { taxTypeId, provinceId, rate, startDate, code } = createDto;

    const insertResult = await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into(TaxCode)
      .values({
        taxTypeId,
        provinceId,
        rate,
        startDate,
        code,
      })
      .execute();
    await queryRunner.commitTransaction();
    const newTaxCodeId = insertResult.identifiers[0].id;

    const createdTaxCode = await queryRunner.manager.findOne(TaxCode, {
      where: { id: newTaxCodeId },
    });
    
    return createdTaxCode;

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

private async getExistingTaxCode(id: number, queryRunner: QueryRunner) {
  return await queryRunner.manager
    .createQueryBuilder()
    .select('tax_code')
    .from(TaxCode, 'tax_code')
    .where('tax_code.id = :id', { id })
    .getOne();
}

async updateTaxCode(
  id: number,
  updateDto: UpdateTaxCodeRequestDto,
  userId: number,
) {
  const { taxTypeId, provinceId, rate, startDate, code } = updateDto;

  const queryRunner = this.taxCodeRepository.manager.connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {

    const existingTaxCode = await this.getExistingTaxCode(id, queryRunner);

    if (!existingTaxCode) {
      throw new NotFoundException('Tax code not found');
    }


    const updateData: any = {};

    if (taxTypeId) updateData.taxTypeId = taxTypeId;
    if (provinceId) updateData.provinceId = provinceId;
    if (rate) updateData.rate = rate;
    if (startDate) updateData.startDate = new Date(startDate);
    if (code) updateData.code = code;

  


    await queryRunner.manager
      .createQueryBuilder()
      .update(TaxCode)
      .set(updateData)
      .where('id = :id', { id })
      .execute();

 
    const updatedTaxCode = await queryRunner.manager.findOne(TaxCode, {
      where: { id },
    });

    if (!updatedTaxCode) {
      throw new Error('Failed to fetch updated tax code');
    }

    await queryRunner.commitTransaction();
    return updatedTaxCode;

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;

  } finally {
    await queryRunner.release();
  }
}

async deleteTaxCode(
  id:number,
  userId:number,

){
  const queryRunner = this.taxCodeRepository.manager.connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try{
     const existingTaxCode = await this.getExistingTaxCode(id,queryRunner);

     if(!existingTaxCode){
      throw new NotFoundException('TaxCode Not found');
     }

     await queryRunner.manager
     .createQueryBuilder()
     .delete()
     .from(TaxCode)
     .where('id = :id', { id })
     .execute()

  await queryRunner.commitTransaction();
  
  return{
    id:existingTaxCode.id,
    deletedByUserId:userId
  };

  }catch(error){
    await queryRunner.rollbackTransaction();
    throw error;

  }finally{
    await queryRunner.release();
  }

}


}