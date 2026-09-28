import { Controller, Get, NotFoundException, BadRequestException, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { TeacherScheduleService } from '../services/teacher-schedule.service';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { LocationId } from 'src/shared/decorators/location-id.decorator';

@Controller('admin/v2/:location/teachers')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class TeacherScheduleController {
  constructor(
    private readonly teacherScheduleService: TeacherScheduleService,
  ) {}

  @Get(':id/schedule-events')
  @Roles(RolesEnum.BACKEND_USER)
  async getTeacherScheduleEvents(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string, // This is only for showing in the error message
    @Param('id') id: number,
    @Query('date') date?: string,
    @Query('showAll') showAll?: string,
  ) {
    try {
      // Parse showAll parameter (can be 'true', 'false', or undefined)
      const isShowAll = showAll === 'true' || showAll === '1';

      const scheduleDetails = await this.teacherScheduleService.getTeacherScheduleEvents(
        locationSlug,
        locationId,
        id,
        date,
        isShowAll,
      );

      return ResponseHelper.success(scheduleDetails, 'Teacher schedule details retrieved successfully');
    } catch (error) {
      console.error('Error in teacher schedule details controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve teacher schedule details');
    }
  }
}

