import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { DailyScheduleRequestDto } from '../dto/daily-schedule-request.dto';
import { DailyScheduleService } from '../services/daily-schedule.service';

@Controller('admin/v2/:location/schedule')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class DailyScheduleController {
  constructor(private readonly dailyScheduleService: DailyScheduleService) {}

  @Get('daily-schedule')
  @Roles(RolesEnum.BACKEND_USER)
  async getDailySchedule(
    @LocationId() locationId: number,
    @Query() query: DailyScheduleRequestDto,
  ) {
    try {
      const data = await this.dailyScheduleService.getDailySchedule(locationId, query);
      return ResponseHelper.success(data, 'Daily schedule retrieved successfully');
    } catch (error) {
      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message || 'Invalid request');
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        error.message || 'Failed to retrieve daily schedule',
      );
    }
  }
}
