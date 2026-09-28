import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CalendarEventColorRepository } from '../repositories/calendar-event-color.repository';
import { CalendarEventColorTransformationService } from './transformations/calendar-event-color-transformation.service';
import { CalendarEventColorListResponseDto } from '../dto/calendar-event-color-response.dto';
import { UpdateCalendarEventColorResponseDto } from '../dto/update-calendar-event-color-response.dto';
import { plainToInstance } from 'class-transformer';
import { UpdateCalendarEventColorRequestDto } from '../dto/update-calendar-event-color-request.dto';

@Injectable()
export class CalendarEventColorService {
  constructor(
    private readonly colorRepo: CalendarEventColorRepository,
    private readonly transformService: CalendarEventColorTransformationService,
  ) {}

  async getColors(): Promise<CalendarEventColorListResponseDto> {
    const items = await this.colorRepo.findAll();

    return {
      body: this.transformService.transformRows(items),
    };
  }

  async updateCalendarEventColors(
  userId: number,
  updateDto: UpdateCalendarEventColorRequestDto,
): Promise<UpdateCalendarEventColorResponseDto[] | any> {
  try {

    const updatedColors: any[] =
      await this.colorRepo.updateCalendarEventColors(
        updateDto.colors,
        userId,
      );


    const response = updatedColors.map(color => {
      const dto = plainToInstance(
        UpdateCalendarEventColorResponseDto,
        color,
        {
          excludeExtraneousValues: true,
        },
      );

      
      dto.updatedByUserId = userId;

      return dto;
    });

    return response;

  } catch (error) {
    console.error(
      'Error in updateCalendarEventColors service:',
      error,
    );

    if (
      error instanceof NotFoundException ||
      error instanceof BadRequestException
    ) {
      throw error;
    }

    throw new BadRequestException(
      'Failed to update calendar event colors',
    );
  }
}

}
