import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryRunner, Repository } from 'typeorm';
import { CalendarEventColor } from '../entities/calendar-event-color.entity';
import { UpdateCalendarEventColorItemDto } from '../dto/update-calendar-event-color-request.dto';

@Injectable()
export class CalendarEventColorRepository {
  constructor(
    @InjectRepository(CalendarEventColor)
    private readonly repo: Repository<CalendarEventColor>,
  ) {}

  async findAll() {
    return await this.repo.find({
      order: { id: 'ASC' } 
    });
  }

  private async getExistingCalendarEventColor(
  id: number,
  queryRunner: QueryRunner,
) {
  return await queryRunner.manager
    .createQueryBuilder()
    .select('calendar_event_color')
    .from(CalendarEventColor, 'calendar_event_color')
    .where('calendar_event_color.id = :id', { id })
    .getOne();
}
async updateCalendarEventColors(
  colors: UpdateCalendarEventColorItemDto[],
  userId: number,
) {
  const queryRunner =  
    this.repo.manager.connection.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const updatedColors: CalendarEventColor[] = [];

    for (const color of colors) {
      const { id, code, } = color;
    
      const existingColor = await this.getExistingCalendarEventColor(
        id,
        queryRunner,
      );

      if (!existingColor) {
        throw new NotFoundException(
          `Calendar event color with ID ${id} not found`,
        );
      }

      const updateData: any = {};
      if (code) updateData.code = code;
 

      await queryRunner.manager
        .createQueryBuilder()
        .update(CalendarEventColor)
        .set(updateData)
        .where('id = :id', { id })
        .execute();

      const updatedColor = await queryRunner.manager.findOne(
        CalendarEventColor,
        { where: { id } },
      );

      if (!updatedColor) {
        throw new Error(
          `Failed to fetch updated calendar event color with ID ${id}`,
        );
      }

      updatedColors.push(updatedColor);
    }

    await queryRunner.commitTransaction();
    return updatedColors;

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error; 

  } finally {
    await queryRunner.release();
  }
}

}
