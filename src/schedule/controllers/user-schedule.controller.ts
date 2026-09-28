import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthService, type AuthenticatedUser } from '../../auth/services/auth.service';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { ScheduleService } from '../services/schedule.service';
import { CustomerUserScheduleService } from '../services/user-schedule.service';
import { RenderDayEventsRequestDto } from '../dto/render-day-events-request.dto';
import { TeacherViewRequestDto } from '../dto/teacher-view-request.dto';
import { ScheduleDetailsRequestDto } from '../dto/schedule-details-request.dto';

@Controller('user/v2/:location/schedule')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class UserScheduleController {
  constructor(
    private readonly scheduleService: ScheduleService,
    private readonly customerUserScheduleService: CustomerUserScheduleService,
    private readonly authService: AuthService,
  ) {}

  @Get('details')
  @Roles(RolesEnum.TEACHER, RolesEnum.CUSTOMER)
  async getMyScheduleDetails(
    @LocationId() locationId: number,
    @Query() queryParams: ScheduleDetailsRequestDto,
  ) {
    try {
      const targetDate = queryParams?.date? new Date(queryParams.date) : new Date();
      const scheduleDetails = await this.scheduleService.getScheduleDetails(
        locationId,
        targetDate,
      );

      return ResponseHelper.success(
        scheduleDetails,
        'Schedule details retrieved successfully',
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(
          error.message || 'Invalid request',
        );
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Failed to retrieve schedule details';

      return ResponseHelper.errors.INTERNAL_ERROR(message);
    }
  }

  @Get('events')
  @Roles(RolesEnum.TEACHER, RolesEnum.CUSTOMER)
  async getMyTeacherViewEvents(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    queryParams: TeacherViewRequestDto,
  ) {
    try {
      const portalUserId = await this.authService.resolvePortalUserId(
        currentUser.id,
        locationId,
      );

      if (!portalUserId) {
        return ResponseHelper.error(
          'NOT_FOUND',
          `User with ID ${currentUser.id} not found in location ${locationSlug}`,
        );
      }

      const events = currentUser.roles.includes(RolesEnum.TEACHER)
        ? await this.scheduleService.renderDayEvents(
            locationId,
            locationSlug,
            {
              ScheduleSearch: {
                date:
                  queryParams.date || new Date().toISOString().split('T')[0],
                showAll: (queryParams.showAll || '0') === '1',
                teacherId: portalUserId,
              },
            } as RenderDayEventsRequestDto,
            'user',
          )
        : await this.customerUserScheduleService.renderCustomerDayEvents(
            locationId,
            locationSlug,
            queryParams.date,
            portalUserId,
          );

      return ResponseHelper.success(
        events,
        'Schedule events retrieved successfully',
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(
          error.message || 'Invalid request',
        );
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Failed to retrieve schedule events';

      return ResponseHelper.errors.INTERNAL_ERROR(message);
    }
  }
}
