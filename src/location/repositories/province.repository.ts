import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryRunner, Repository } from 'typeorm';
import { Province } from '../entities/province.entity';
import { Location } from '../entities/location.entity';
import { ProvinceGeodataDto } from '../dto/location-geodata.dto';
import { plainToClass } from 'class-transformer';
import { CreateProvinceRequestDto } from '../dto/create-province-request.dto';
import { UpdateProvinceRequestDto } from '../dto/update-province-request.dto';
import { getCurrentESTDate } from 'src/utils/date-utils';

@Injectable()
export class ProvinceRepository {
  constructor(
    @InjectRepository(Province)
    private readonly provinceRepository: Repository<Province>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
  ) {}

  async findGeodata(): Promise<ProvinceGeodataDto[]> {
    const provinces = await this.provinceRepository.find({
      select: { id: true, name: true },
      order: { name: 'ASC' },
    });

    return provinces.map(province =>
      plainToClass(ProvinceGeodataDto, province, {
        excludeExtraneousValues: true,
      }),
    );
  }

  /**
   * Get province ID from location ID
   * Used for tax rate calculation based on location
   * @param locationId - Location ID
   * @returns Province ID or undefined if location not found
   */
  async getProvinceId(locationId: number): Promise<number | undefined> {
    const location = await this.locationRepository.findOne({
      where: { id: locationId },
      select: ['id', 'provinceId'],
    });
    return location?.provinceId;
  }


  async findProvinces(
  name?: string,
  page: number = 1,
  limit: number = 20,
  sort?: 'name',
  order?: 'ASC' | 'DESC',
) {
  const query = this.provinceRepository
    .createQueryBuilder('province')
    .leftJoinAndSelect('province.country', 'country');

  
  if (name) {
    query.where('province.name LIKE :name', {
      name: `%${name}%`,
    });
  }


  if (sort && order) {
    query.orderBy('province.name', order);
  }

  
  const total = await query.getCount();

  const items = await query
    .skip((page - 1) * limit)
    .take(limit)
    .getMany();

  return { items, total };
}

async createProvince(
  createDto: CreateProvinceRequestDto,
  userId: number,
): Promise<any> {
  const queryRunner = this.provinceRepository.manager.connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const { name, taxRate, countryId } = createDto;

    const createdOn = getCurrentESTDate();
    const insertResult = await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into(Province)
      .values({
        name,
        taxRate,
        countryId,
        createdOn,
        createdByUserId: userId,
        updatedByUserId: userId,
      })
      .execute();

    const newProvinceId = insertResult.identifiers[0].id;


    const createdProvince = await queryRunner.manager.findOne(Province, {
      where: { id: newProvinceId },
    });

    await queryRunner.commitTransaction();

    return createdProvince;

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

private async getExistingProvince(id: number, queryRunner: QueryRunner) {
  return await queryRunner.manager
    .createQueryBuilder()
    .select('province')
    .from(Province, 'province')
    .where('province.id = :id', { id })
    .getOne();
}

async updateProvince(
  id: number,
  updateDto: UpdateProvinceRequestDto,
  userId: number,
) {
  const { name, taxRate, countryId } = updateDto;

  const queryRunner = this.provinceRepository.manager.connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const existingProvince = await this.getExistingProvince(id, queryRunner);

    if (!existingProvince) {
      throw new NotFoundException('Province not found');
    }

    const updateData: any = {};

    if (name) updateData.name = name;
    if (taxRate) updateData.taxRate = taxRate;
    if (countryId) updateData.countryId = countryId;

    updateData.updatedOn = getCurrentESTDate();
    updateData.updatedByUserId = userId;

    await queryRunner.manager
      .createQueryBuilder()
      .update(Province)
      .set(updateData)
      .where('id = :id', { id })
      .execute();

    const updatedProvince = await queryRunner.manager.findOne(Province, { where: { id } });

    if (!updatedProvince) {
      throw new Error('Failed to fetch updated province');
    }

    await queryRunner.commitTransaction();
    return updatedProvince;

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;

  } finally {
    await queryRunner.release();
  }
}
async deleteProvince(id: number, userId: number) {
  const queryRunner = this.provinceRepository.manager.connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {

    const existingProvince = await this.getExistingProvince(id, queryRunner);

    if (!existingProvince) {
      throw new NotFoundException('Province not found');
    }

    await queryRunner.manager
      .createQueryBuilder()
      .delete()
      .from(Province)
      .where('id = :id', { id })
      .execute();

    await queryRunner.commitTransaction();

    return {
      id: existingProvince.id,
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