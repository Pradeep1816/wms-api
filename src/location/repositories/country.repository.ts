import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Country } from '../entities/country.entity';
import { CountryGeodataDto } from '../dto/location-geodata.dto';
import { plainToClass } from 'class-transformer';
import { getCurrentESTDate } from 'src/utils/date-utils';

@Injectable()
export class CountryRepository {
  constructor(
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
  ) {}

  async findGeodata(): Promise<CountryGeodataDto[]> {
    const countries = await this.countryRepository.find({
      select: { id: true, name: true },
      order: { name: 'ASC' },
    });

    return countries.map(country =>
      plainToClass(CountryGeodataDto, country, {
        excludeExtraneousValues: true,
      }),
    );
  }

   async findCountries(
    name?: string,
    page: number = 1,
    limit: number = 20,
    sort: 'name' = 'name',
    order: 'ASC' | 'DESC' = 'ASC',
  ) {
    const query = this.countryRepository
      .createQueryBuilder('country')
    

    if (name) {
      query.andWhere('country.name LIKE :name', { name: `%${name}%` });
    }


    const sortMapping = {
      name: 'country.name',
    };

    const sortField =
      sortMapping[sort] || 'country.name'; 

    query.orderBy(sortField, order);

    
    const total = await query.getCount();

    
    const items = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { items, total };
  }

  async updateCountry(id: number, name: string, userId: number){
  const queryRunner = this.countryRepository.manager.connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    
    const existingCountry = await queryRunner.manager
      .createQueryBuilder(Country, 'country')
      .where('country.id = :id', { id })
      .getOne();

    if (!existingCountry) {
      throw new Error('Country not found');
    }

    
    const duplicate = await queryRunner.manager
      .createQueryBuilder(Country, 'country')
      .where('country.name = :name', { name })
      .andWhere('country.id != :id', { id })
      .getOne();

    if (duplicate) {
      throw new Error('Country name already exists');
    }


    const updateData: any = {};
    if (name) updateData.name = name;
    updateData.updatedOn = getCurrentESTDate();
    updateData.updatedByUserId = userId;

 
    await queryRunner.manager
      .createQueryBuilder()
      .update(Country)
      .set(updateData)
      .where('id = :id', { id })
      .execute();


    const updatedCountry = await queryRunner.manager.findOne(Country, {
      where: { id },
    });

    if (!updatedCountry) {
      throw new Error('Failed to fetch updated country');
    }


    await queryRunner.commitTransaction();

    return updatedCountry;

  
  }
catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;

  } finally {
    await queryRunner.release();
  }
}
      
    
  async createCountry(name: string, userId: number) {

    
  const queryRunner = this.countryRepository.manager.connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try{

    const existing = await queryRunner.manager
      .createQueryBuilder(Country, 'country')
      .where('country.name = :name', { name })
      .getOne();

    if (existing) {
      throw new Error('Country already exists');
    }


    const createdOn = getCurrentESTDate();

    const insertResult = await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into(Country)
      .values({
        name,
        createdOn: createdOn,
        updatedOn: createdOn,
        createdByUserId: userId,
        updatedByUserId: userId,
        
      })
      .execute();

    const newCountryId = insertResult.identifiers[0].id;

    const createdCountry = await queryRunner.manager.findOne(Country, {
      where: { id: newCountryId },
    });

   
    if (!createdCountry) {
      throw new Error('Failed to fetch newly created country');
    }

  
    await queryRunner.commitTransaction();

    return createdCountry; 

  } 
catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;

  } finally {
    await queryRunner.release();
  }
  }

  async deleteCountry(id: number, userId: number): Promise<any> {
  const queryRunner = this.countryRepository.manager.connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {

    const existingCountry = await queryRunner.manager
      .createQueryBuilder()
      .select('country')
      .from(Country, 'country')
      .where('country.id = :id', { id })
      .getOne();

    if (!existingCountry) {
      throw new NotFoundException('Country not found');
    }


    await queryRunner.manager
      .createQueryBuilder()
      .delete()
      .from(Country)
      .where('id = :id', { id })
      .execute();

 
    await queryRunner.commitTransaction();


    return {
      id: id,
      name: existingCountry.name,
      deleted: true,
    };
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}



}