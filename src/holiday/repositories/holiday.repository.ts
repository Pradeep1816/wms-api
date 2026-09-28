import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryRunner, Repository } from 'typeorm';
import { Holiday } from '../../holiday/entities/holiday.entity';
import { CreateHolidayRequestDto } from '../dto/create-holiday-request.dto';
import { UpdateHolidayRequestDto } from '../dto/update-holiday-request.dto';
import { getCurrentESTDate } from '../../utils/date-utils';

@Injectable()
export class HolidayRepository {
  constructor(
    @InjectRepository(Holiday)
    private readonly holidayRepository: Repository<Holiday>,
  ) {}

  // Get Existing Holiday
  private async getExistingHoliday(id: number, queryRunner: QueryRunner) {
    return await queryRunner.manager.findOne(Holiday, {
      where: { id, isDeleted: false },
    });
  }

  async getPaginatedHolidays(
    page: number,
    limit: number,
    sort: 'date',
    order: 'ASC',
  ) {
    const skip = (page - 1) * limit;

    try {
      const [holidays, total] = await this.holidayRepository.findAndCount({
        where: { isDeleted: false },
        order: { [sort]: order },
        skip,
        take: limit,
      });

      return { holidays, total };
    } catch (error) {
      console.error('Database Error in HolidayRepository.getPaginatedHolidays:', error.message);
      throw new Error('DATABASE_ERROR');
    }
  }

  async createHoliday(
  createDto: CreateHolidayRequestDto,
  userId: number,
): Promise<any> {

  const queryRunner = this.holidayRepository.manager.connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const { date, description } = createDto;

    const formattedDate = date.split('T')[0]+ ' 12:00:00';

    const insertResult = await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into('holiday')
      .values({
        date: formattedDate,
        description,
        isDeleted: false,
      })
      .execute();

    const newId = insertResult.identifiers[0].id;

    const created = await queryRunner.manager.findOne('holiday', {
      where: { id: newId },
    });

    await queryRunner.commitTransaction();
    return created;

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

async updateHoliday(
  id: number,
  updateDto: UpdateHolidayRequestDto,
  userId: number,
) {
  const { date, description } = updateDto;

  const queryRunner =
    this.holidayRepository.manager.connection.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const existingHoliday = await this.getExistingHoliday(id, queryRunner);

    if (!existingHoliday) {
      throw new NotFoundException('Holiday not found');
    }

    const updateData: any = {};

    if (date) {
      updateData.date = date.split('T')[0]+ ' 12:00:00';
    }

    if (description) {
      updateData.description = description;
    }

    await queryRunner.manager
      .createQueryBuilder()
      .update(Holiday)
      .set(updateData)
      .where('id = :id', { id })
      .execute();

    const updatedHoliday = await queryRunner.manager.findOne(Holiday, {
      where: { id },
    });

    if (!updatedHoliday) {
      throw new Error('Failed to fetch updated holiday');
    }

    await queryRunner.commitTransaction();
    return updatedHoliday;

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
async deleteHoliday(
  id: number,
  userId: number,
) {
  const queryRunner =
    this.holidayRepository.manager.connection.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const existingHoliday = await this.getExistingHoliday(
      id,
      queryRunner,
    );

    if (!existingHoliday) {
      throw new NotFoundException('Holiday not found');
    }

    const deletedOn = getCurrentESTDate();

    await queryRunner.manager
      .createQueryBuilder()
      .update(Holiday)
      .set({
        isDeleted: true,
      })
      .where('id = :id', { id })
      .execute();

    await queryRunner.commitTransaction();

    return {
      id: id,
      deletedByUserId: userId,
      deletedOn: deletedOn,
    };

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;

  } finally {
    await queryRunner.release();
  }
}

}
