import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { HolidayRepository } from '../repositories/holiday.repository';
import { formatDate } from '../../utils/date-utils';
import { GetHolidaysRequestDto } from '../dto/holiday-request-dto';
import { CreateHolidayRequestDto } from '../dto/create-holiday-request.dto';
import { UpdateHolidayRequestDto } from '../dto/update-holiday-request.dto';
import { HolidayListResponseDto } from '../dto/holiday-response-dto';
@Injectable()
export class HolidayService {
  constructor(private readonly holidayRepository: HolidayRepository) {}

  async getAllHolidays(queryParams: GetHolidaysRequestDto): Promise<HolidayListResponseDto> {
    const { page, limit, sort = 'date', order = 'ASC' } = queryParams;

    try {
      
      const { holidays, total } = await this.holidayRepository.getPaginatedHolidays(page, limit, sort, order);

      
      const holidayData = holidays.map((h) => ({
        id: h.id,
        date: formatDate(h.date),
        description: h.description,
      }));

      
      const totalPages = Math.ceil(total / limit);
      const pagination = {
        page,
        limit,
        total,
        totalPages,
      };

      
      return {
        body: holidayData,
        pagination,
      };
    } catch (error) {
      console.error('Error in getAllHolidays:', error);
      throw new Error('DATABASE_ERROR');
    }
  }

  async createHoliday(
  userId: number,
  createDto: CreateHolidayRequestDto,
): Promise<any> {
  try {

    const holiday = await this.holidayRepository.createHoliday(
      createDto,
      userId,
    );

  
    const response: any = {
      id: holiday.id,
      date: formatDate(holiday.date),
      description: holiday.description,
      createdByUserId: userId,
    };

    return response;

  } catch (error) {
    console.error('Error in createHoliday service:', error);

    if (error instanceof NotFoundException || error instanceof BadRequestException) {
      throw error;
    }

    throw new BadRequestException('Failed to create holiday');
  }
}
async updateHoliday(
  id: number,
  userId: number,
  updateDto: UpdateHolidayRequestDto,
){
  try {

    const updatedHoliday = await this.holidayRepository.updateHoliday(
      id,
      updateDto,
      userId,
    );

    const response: any = {
      id: updatedHoliday.id,
      date: formatDate(updatedHoliday.date),
      description: updatedHoliday.description,
      updatedByUserId: userId,
    };

    return response;

  } catch (error) {
    console.error('Error in updateHoliday service:', error);

    if (
      error instanceof NotFoundException ||
      error instanceof BadRequestException
    ) {
      throw error;
    }

    throw new BadRequestException('Failed to update holiday');
  }
}
async deleteHoliday(
  id: number,
  userId: number,
) {
  try {
    const deletedResult =
      await this.holidayRepository.deleteHoliday(
        id,
        userId,
      );

    if (!deletedResult || !deletedResult.id) {
      throw new BadRequestException('Failed to delete holiday');
    }

    return {
      id: deletedResult.id,
      deletedByUserId: userId,
      deletedOn: deletedResult.deletedOn,
    };

  } catch (error) {
    console.error('Error in deleteHoliday service:', error);

    if (
      error instanceof NotFoundException ||
      error instanceof BadRequestException
    ) {
      throw error;
    }

    throw new BadRequestException('Failed to delete holiday');
  }
}

}
