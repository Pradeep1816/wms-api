import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryRunner, Repository } from 'typeorm';
import { City } from '../entities/city.entity';
import { CityGeodataDto } from '../dto/location-geodata.dto';
import { plainToClass } from 'class-transformer';
import { CreateCityRequestDto } from '../dto/create-city-request.dto';
import { Province } from '../entities/province.entity';
import { UpdateCityRequestDto } from '../dto/update-city-request.dto';
import { getCurrentESTDate } from '../../utils/date-utils';

@Injectable()
export class CityRepository {
  constructor(
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
  ) {}

  // Get Existing City
  private async getExistingCity(id: number, queryRunner: QueryRunner) {
    return await queryRunner.manager.findOne(City, {
      where: { id, isDeleted: false },
    });
  }

  async findGeodata(): Promise<CityGeodataDto[]> {
    const cities = await this.cityRepository.find({
      where: { isDeleted: false },
      select: { id: true, name: true },
      order: { name: 'ASC' },
    });

    return cities.map(city =>
      plainToClass(CityGeodataDto, city, {
        excludeExtraneousValues: true,
      }),
    );
  }
  async findCities(
  name?: string,
  province?: string,
  page: number = 1,
  limit: number = 20,
  sort?: 'name' | 'province',
  order?: 'ASC' | 'DESC',
) {
  const query = this.cityRepository
    .createQueryBuilder('city')
    .leftJoinAndSelect('city.province', 'province')
    .where('city.isDeleted = :deleted', { deleted: false });

  if (name) {
    query.andWhere('city.name LIKE :name', { name: `%${name}%` });
  }

  if (province) {
    query.andWhere('province.name LIKE :prov', {
      prov: `%${province}%`,
    });
  }


  if (sort && order) {
    const sortField = sort === 'province' ? 'province.name' : 'city.name';
    query.orderBy(sortField, order);
  }

  const total = await query.getCount();

  const items = await query
    .skip((page - 1) * limit)
    .take(limit)
    .getMany();

  return { items, total };
}

async createCity(createDto:CreateCityRequestDto,userId:number){
  const queryRunner = this.cityRepository.manager.connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try{
    const {name,provinceId}=createDto;

  const province = await queryRunner.manager
  .createQueryBuilder(Province, 'province')
  .where('province.id = :provinceId', { provinceId })
  .getOne();

    if (!province) {
    throw new Error(`Province with ID ${provinceId} not found`);
   }

    const now = getCurrentESTDate();

    const insertResult = await queryRunner.manager
    .createQueryBuilder()
    .insert()
    .into(City)
    .values({
      name,
      provinceId,
      createdOn: now,
      updatedOn: now,
      createdByUserId: userId,
      updatedByUserId: userId,
      isDeleted: false,
    })
    .execute();
    const newCityId = insertResult.identifiers[0].id;

    const createdCity = await queryRunner.manager.findOne(City,{
      where:{id:newCityId},
    })
    if(!createdCity){
      throw new Error('Failed to fetch newely created city');
    }
    await queryRunner.commitTransaction();
    return createdCity;
}
catch(error){
  await queryRunner.rollbackTransaction();
  throw error;
}finally{
  await queryRunner.release();
}
}


async updateCity( id:number,updateDto: UpdateCityRequestDto, userId: number) {
  const { name, provinceId } = updateDto;

  const queryRunner = this.cityRepository.manager.connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    
    const existingCity = await this.getExistingCity(id, queryRunner);
    if (!existingCity) {
      throw new NotFoundException('City not found');
    } 

    if (name && provinceId) {
      const duplicate = await queryRunner.manager
        .createQueryBuilder(City, 'city')
        .where('city.name = :name', { name })
        .andWhere('city.provinceId = :provinceId', { provinceId })
        .andWhere('city.id != :id', { id })
        .andWhere('city.isDeleted = false')
        .getOne();

      if (duplicate) {
        throw new Error('City already exists within the same province');
      }
    }

   
    const updateData: any = {};

    if (name) updateData.name = name;
    if (provinceId) updateData.provinceId = provinceId;

    updateData.updatedOn = getCurrentESTDate();
    updateData.updatedByUserId = userId;

    await queryRunner.manager
      .createQueryBuilder()
      .update(City)
      .set(updateData)
      .where('id = :id', { id })
      .execute();

 
    const updatedCity = await queryRunner.manager.findOne(City, {
      where: { id },
    });

    if (!updatedCity) {
      throw new Error('Failed to fetch updated city');
    }

 
    await queryRunner.commitTransaction();
    return updatedCity;

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;

  } finally {
    await queryRunner.release();
  }
}


async deleteCity(id: number, userId: number) {
  const queryRunner = this.cityRepository.manager.connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const existingCity = await this.getExistingCity(id, queryRunner);
    if (!existingCity) {
      throw new NotFoundException('City not found');
    }

    const deletedOn = getCurrentESTDate();

    await queryRunner.manager
      .createQueryBuilder()
      .update(City)
      .set({
        isDeleted: true,
        updatedOn: deletedOn,
        updatedByUserId: userId,
      })
      .where('id = :id', { id })
      .execute();

    await queryRunner.commitTransaction();

    return {
      id: id,
      name: existingCity.name,
      provinceId: existingCity.provinceId,
      deletedOn: deletedOn,
      deletedByUserId: userId,
    };
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
}