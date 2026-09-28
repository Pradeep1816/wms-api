import { Body, Controller, Get, Put, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { CalendarEventColorService } from '../services/calendar-event-color.service';
import { ResponseHelper } from 'src/shared/helpers/response.helper';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesEnum } from 'src/auth/enums/roles.enum';
import { CalendarEventColorResponseDto } from '../dto/calendar-event-color-response.dto';
import { UpdateCalendarEventColorRequestDto } from '../dto/update-calendar-event-color-request.dto';
import { UpdateCalendarEventColorResponseDto } from '../dto/update-calendar-event-color-response.dto';

@UseGuards(AuthGuard, RolesGuard)
@Controller('admin/v2')
export class CalendarEventColorController {
  constructor(private readonly service: CalendarEventColorService) {}

   @Get("calendar-event-colors")
  @Roles(RolesEnum.ADMINISTRATOR)
  async getColors(): Promise<CalendarEventColorResponseDto[] | any> {
    try {
      const data = await this.service.getColors();
      return ResponseHelper.success(data, 'Calendar event colors fetched successfully');
    } catch (error) {
      console.error('Error fetching calendar event colors:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve calendar event colors',
      );
    }
  }
  @Put('calendar-event-colors')
@Roles(RolesEnum.ADMINISTRATOR)
async updateCalendarEventColors(
  @Req() req: any,
  @Body(ValidationPipe) updateDto: UpdateCalendarEventColorRequestDto,
): Promise<UpdateCalendarEventColorResponseDto[] | any> {
  try {
    const userId = req.user?.id;

    const result = await this.service.updateCalendarEventColors(
      userId,
      updateDto,
    );

    return ResponseHelper.success(
      result,
      'Calendar event colors updated successfully',
    );

  } catch (error) {
    console.error('Error in updateCalendarEventColors controller:', error);

    if (error.message?.includes('not found')) {
      return ResponseHelper.error('NOT_FOUND', error.message);
    }

    if (
      error.message?.includes('validation') ||
      error.message?.includes('Invalid')
    ) {
      return ResponseHelper.error('BAD_REQUEST', error.message);
    }

    return ResponseHelper.error(
      'INTERNAL_SERVER_ERROR',
      'Failed to update calendar event colors',
    );
  }
}

}
