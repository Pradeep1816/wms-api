import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { DashboardService } from '../services/dashboard.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { EnrolmentGainsRequestDto } from '../dto/enrolment-gains-request.dto';
import { EnrolmentLossesRequestDto } from '../dto/enrolment-losses-request.dto';
import { InstructionHoursRequestDto } from '../dto/instruction-hours-request.dto';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { LocationResolveGuard } from '../../shared/guards/location.guard';

@Controller('admin/v2/:location/dashboard')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('enrolment-gains')
  @Roles(RolesEnum.BACKEND_USER)
  async getEnrolmentGains(
    @LocationId() locationId: number,
    @Query(ValidationPipe) queryParams: EnrolmentGainsRequestDto,
  ) {
    try {      
      const data = await this.dashboardService.getEnrolmentGains(locationId, queryParams);

      return ResponseHelper.success(data, 'Enrolment gains data retrieved successfully');
    } catch (error) {
      console.error('Error in getEnrolmentGains controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('validation')) {
        return ResponseHelper.error('VALIDATION_ERROR', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve enrolment gains data');
    }
  }

  @Get('enrolment-losses')
  @Roles(RolesEnum.BACKEND_USER)
  async getEnrolmentLosses(
    @LocationId() locationId: number,
    @Query(ValidationPipe) queryParams: EnrolmentLossesRequestDto,
  ) {
    try {
      const data = await this.dashboardService.getEnrolmentLosses(locationId, queryParams);

      return ResponseHelper.success(data, 'Enrolment losses data retrieved successfully');
    } catch (error) {
      console.error('Error in getEnrolmentLosses controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('validation')) {
        return ResponseHelper.error('VALIDATION_ERROR', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve enrolment losses data');
    }
  }

  @Get('parked-enrolments')
  @Roles(RolesEnum.BACKEND_USER)
  async getParkedEnrolments(
    @LocationId() locationId: number,
    @Query(ValidationPipe) queryParams: EnrolmentGainsRequestDto,
  ) {
    try {
      const data = await this.dashboardService.getParkedEnrolments(locationId, queryParams);

      return ResponseHelper.success(data, 'Parked enrolments data retrieved successfully');
    } catch (error) {
      console.error('Error in getParkedEnrolments controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('validation')) {
        return ResponseHelper.error('VALIDATION_ERROR', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve parked enrolments data');
    }
  }

  @Get('instruction-hours')
  @Roles(RolesEnum.BACKEND_USER)
  async getInstructionHours(
    @LocationId() locationId: number,
    @Query(ValidationPipe) queryParams: InstructionHoursRequestDto,
  ) {
    try {
      const data = await this.dashboardService.getInstructionHours(locationId, queryParams);

      return ResponseHelper.success(data, 'Instruction hours data retrieved successfully');
    } catch (error) {
      console.error('Error in getInstructionHours controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('validation')) {
        return ResponseHelper.error('VALIDATION_ERROR', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve instruction hours data');
    }
  }

  @Get('monthly-revenue')
  @Roles(RolesEnum.BACKEND_USER)
  async getMonthlyRevenue(@LocationId() locationId: number) {
    try {
      const data = await this.dashboardService.getMonthlyRevenue(locationId);

      return ResponseHelper.success(data, 'Monthly revenue data retrieved successfully');
    } catch (error) {
      console.error('Error in getMonthlyRevenue controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve monthly revenue data');
    }
  }
}
