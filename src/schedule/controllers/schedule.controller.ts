import { Controller, Get, Param, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ScheduleService } from '../services/schedule.service';
import { ScheduleDetailsRequestDto } from '../dto/schedule-details-request.dto';
import { TeacherViewRequestDto } from '../dto/teacher-view-request.dto';
import { RenderDayEventsRequestDto } from '../dto/render-day-events-request.dto';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from 'src/shared/decorators/location-id.decorator';

@Controller('admin/v2/:location/schedule')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {
  }

  @Get('details')
  @Roles(RolesEnum.BACKEND_USER)
  async getScheduleDetails(
    @LocationId() locationId: number,
    @Query() queryParams: ScheduleDetailsRequestDto,
  ) {
    try {
      const targetDate = queryParams?.date ? new Date(queryParams.date) : new Date();
      const scheduleDetails = await this.scheduleService.getScheduleDetails(locationId, targetDate);
      
      return ResponseHelper.success(scheduleDetails, 'Schedule details retrieved successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve schedule details');
    }
  }

  @Get('teacher-view')
  @Roles(RolesEnum.BACKEND_USER)
  async getTeacherView(
    @Param('location') location: string,
    @Query() queryParams: TeacherViewRequestDto,
  ) {
    try {
      const teacherView = await this.scheduleService.getTeacherView(
        location,
        queryParams.date || new Date().toISOString().split('T')[0],
        queryParams.showAll || '0',
        queryParams.programId,
        queryParams.teacherId,
        queryParams.type,
      );
      
      return ResponseHelper.success(teacherView, 'Teacher view retrieved successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve teacher view');
    }
  }

  @Get('teacher-view/events')
  @Roles(RolesEnum.BACKEND_USER)
  async renderDayEvents(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Query('date') date: string,
    @Query('showAll') showAll: string = '0',
    @Query('programId') programId?: string,
    @Query('teacherId') teacherId?: string,
  ) {
    try {
      // Convert query parameters to the expected format
      const request: RenderDayEventsRequestDto = {
        ScheduleSearch: {
          date,
          showAll: showAll === '1',
          programId: programId ? parseInt(programId) : undefined,
          teacherId: teacherId ? parseInt(teacherId) : undefined,
        }
      };

      const dayEvents = await this.scheduleService.renderDayEvents(locationId, locationSlug, request);
      
      return ResponseHelper.success(dayEvents, 'Day events rendered successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to render day events');
    }
  }

  @Get('classroom-view/resources')
  @Roles(RolesEnum.BACKEND_USER)
  async getClassroomResources(
    @Param('location') location: string,
  ) {
    try {
      const classroomResources = await this.scheduleService.getClassroomResources(location);
      
      return ResponseHelper.success(classroomResources, 'Classroom resources retrieved successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve classroom resources');
    }
  }

  @Get('classroom-view/events')
  @Roles(RolesEnum.BACKEND_USER)
  async renderClassroomEvents(
    @Param('location') location: string,
    @Query('date') date: string,
  ) {
    try {
      const classroomEvents = await this.scheduleService.renderClassroomEvents(location, date);
      
      return ResponseHelper.success(classroomEvents, 'Classroom events rendered successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to render classroom events');
    }
  }
}
