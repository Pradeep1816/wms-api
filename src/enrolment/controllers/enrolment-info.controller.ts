import { Controller, Get, Post, Param, ParseIntPipe, UseGuards, Body, Req, ValidationPipe, Query, NotFoundException } from '@nestjs/common';
import { EnrolmentInfoResponseDto } from '../dto/enrolment-info-response.dto';
import { EnrolmentInfoService } from '../services/enrolment-info.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { EnrolmentScheduleResponseDto } from '../dto/enrolment-schedule-response.dto';
import { EnrolmentScheduleHistoryResponseDto } from '../dto/enrolment-schedule-history-response.dto';
import { EnrolmentScheduleService } from '../services/enrolment-schedule.service';
import { EnrolmentService } from '../services/enrolment.service';
import { EnrolmentEmailService } from '../services/enrolment-email.service';
import { GroupEnrolmentPrintService } from '../services/group-enrolment-print.service';
import { EditProgramRateRequestDto } from '../dto/edit-program-rate-request.dto';
import { AdjustEndDateRequestDto, AdjustEndDatePreviewRequestDto } from '../dto/adjust-end-date-request.dto';
import { AdjustEndDatePreviewResponseDto, AdjustEndDateResponseDto } from '../dto/adjust-end-date-response.dto';
import { EnrolmentEmailResponseDto } from '../dto/enrolment-email-response.dto';
import { GroupEnrolmentPrintResponseDto } from '../dto/group-enrolment-print-response.dto';

@Controller('admin/v2/:location/enrolments')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class EnrolmentInfoController {
  constructor(
    private readonly enrolmentInfoService: EnrolmentInfoService,
    private readonly enrolmentScheduleService: EnrolmentScheduleService,
    private readonly enrolmentService: EnrolmentService,
    private readonly enrolmentEmailService: EnrolmentEmailService,
    private readonly groupEnrolmentPrintService: GroupEnrolmentPrintService,
  ) {}

  @Get(':id/info')
  @Roles(RolesEnum.BACKEND_USER)
  async getEnrolmentInfo(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<EnrolmentInfoResponseDto | any> {
    try {
      const result = await this.enrolmentInfoService.getEnrolmentInfo(
        locationId,
        id,
      );
      return ResponseHelper.success(result, 'Enrolment Details retrieved successfully');
    } catch (error) {
      console.error('Error in getEnrolmentInfo controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve enrolment info');
    }
  }

  @Get(':id/schedule')
  @Roles(RolesEnum.BACKEND_USER)
  async getEnrolmentSchedule(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<EnrolmentScheduleResponseDto | any> {
    try {
      const result = await this.enrolmentScheduleService.getEnrolmentSchedule(
        locationId,
        id,
      );
      return ResponseHelper.success(result, 'Enrolment Schedule retrieved successfully');
    } catch (error) {
      console.error('Error in getEnrolmentSchedule controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve enrolment schedule');
    }
  }

  @Get(':id/schedule-history')
  @Roles(RolesEnum.BACKEND_USER)
  async getScheduleHistory(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<EnrolmentScheduleHistoryResponseDto | any> {
    try {
      const result = await this.enrolmentScheduleService.getScheduleHistory(
        locationId,
        id,
      );
      return ResponseHelper.success(result, 'Schedule History retrieved successfully');
    } catch (error) {
      console.error('Error in getScheduleHistory controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve schedule history');
    }
  }

  /**
   * Edit enrolment program rate, auto renew, and online status
   * POST /admin/v2/:location/enrolments/:id/edit-program-rate
   * Matches legacy: EnrolmentController::actionEditProgramRate()
   */
  @Post(':id/edit-program-rate')
  @Roles(RolesEnum.BACKEND_USER)
  async editProgramRate(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: EditProgramRateRequestDto,
    @Req() req: any,
  ): Promise<any> {
    try {
      const loggedUserId = req.user?.id;
      if (!loggedUserId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const result = await this.enrolmentService.editProgramRate(
        locationId,
        id,
        body,
        loggedUserId,
        locationSlug,
      );

      return ResponseHelper.success(result, result.message);
    } catch (error) {
      console.error('Error in editProgramRate controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message?.includes('required') || error.message?.includes('Invalid')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to update enrolment program rate');
    }
  }

  /**
   * Get preview of what will be affected when adjusting end date
   * GET /admin/v2/:location/enrolments/:id/adjust-end-date-preview?endDate=YYYY-MM-DD
   * Matches legacy: EnrolmentController::actionEditEndDate() GET with endDate parameter
   */
  @Get(':id/adjust-end-date-preview')
  @Roles(RolesEnum.BACKEND_USER)
  async getAdjustEndDatePreview(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: AdjustEndDatePreviewRequestDto,
  ): Promise<AdjustEndDatePreviewResponseDto | any> {
    try {
      const result = await this.enrolmentScheduleService.getAdjustEndDatePreview(
        locationId,
        id,
        query.endDate,
      );
      return ResponseHelper.success(result, 'Preview generated successfully');
    } catch (error) {
      console.error('Error in getAdjustEndDatePreview controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message?.includes('required') || error.message?.includes('cannot')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to generate preview');
    }
  }

  /**
   * Adjust enrolment end date (shrink or extend) - PRIVATE ENROLMENTS ONLY
   * POST /admin/v2/:location/enrolments/:id/adjust-end-date
   * Matches legacy: EnrolmentController::actionEditEndDate() POST
   * 
   */
  @Post(':id/adjust-end-date')
  @Roles(RolesEnum.BACKEND_USER)
  async adjustEndDate(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: AdjustEndDateRequestDto,
    @Req() req: any,
  ): Promise<AdjustEndDateResponseDto | any> {
    try {
      const loggedUserId = req.user?.id;
      if (!loggedUserId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const result = await this.enrolmentScheduleService.adjustEndDate(
        locationId,
        id,
        body.endDate,
        loggedUserId,
      );

      return ResponseHelper.success(result, result.message);
    } catch (error) {
      console.error('Error in adjustEndDate controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message?.includes('required') || error.message?.includes('cannot') || error.message?.includes('only available')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to adjust end date');
    }
  }

  /**
   * Get preview of what will be affected when adjusting group enrolment end date
   * GET /admin/v2/:location/enrolments/:id/adjust-group-end-date-preview?endDate=YYYY-MM-DD
   * Matches legacy: GroupEnrolmentController::actionEditEndDate() GET with endDate parameter
   */
  @Get(':id/adjust-group-end-date-preview')
  @Roles(RolesEnum.BACKEND_USER)
  async getGroupAdjustEndDatePreview(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: AdjustEndDatePreviewRequestDto,
  ): Promise<AdjustEndDatePreviewResponseDto | any> {
    try {
      const result = await this.enrolmentScheduleService.getGroupAdjustEndDatePreview(
        locationId,
        id,
        query.endDate,
      );
      return ResponseHelper.success(result, 'Preview generated successfully');
    } catch (error) {
      console.error('Error in getGroupAdjustEndDatePreview controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message?.includes('required') || error.message?.includes('cannot') || error.message?.includes('only available')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to generate preview');
    }
  }

  /**
   * Adjust group enrolment end date (shrink only)
   * POST /admin/v2/:location/enrolments/:id/adjust-group-end-date
   * Matches legacy: GroupEnrolmentController::actionEditEndDate() POST
   */
  @Post(':id/adjust-group-end-date')
  @Roles(RolesEnum.BACKEND_USER)
  async adjustGroupEndDate(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: AdjustEndDateRequestDto,
    @Req() req: any,
  ): Promise<AdjustEndDateResponseDto | any> {
    try {
      const loggedUserId = req.user?.id;
      if (!loggedUserId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const result = await this.enrolmentScheduleService.adjustGroupEndDate(
        locationId,
        id,
        body.endDate,
        loggedUserId,
      );

      return ResponseHelper.success(result, result.message);
    } catch (error) {
      console.error('Error in adjustGroupEndDate controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message?.includes('required') || error.message?.includes('cannot') || error.message?.includes('only available')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to adjust end date');
    }
  }

  /**
   * Get enrolment email statement data
   * GET /admin/v2/:location/enrolments/:id/email-statement
   * Fetches enrollment details, customer emails, email template, lessons and schedules
   * for displaying in the email statement modal
   */
  @Get(':id/email-statement')
  @Roles(RolesEnum.BACKEND_USER)
  async getEnrolmentEmailStatement(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<EnrolmentEmailResponseDto | any> {
    try {
      const result = await this.enrolmentEmailService.getEnrolmentEmailData(locationId,locationSlug, id);
      return ResponseHelper.success(result, 'Enrolment email data retrieved successfully');
    } catch (error) {
      console.error('Error in getEnrolmentEmailStatement controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve enrolment email data');
    }
  }

  @Get(':id/print-details')
  @Roles(RolesEnum.BACKEND_USER)
  async getGroupEnrolmentPrintDetail(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<GroupEnrolmentPrintResponseDto | any> {
    try {
      const result = await this.groupEnrolmentPrintService.getGroupEnrolmentPrintDetail(locationId, id);
      return ResponseHelper.success({ body: result }, 'Group enrolment print details retrieved successfully');
    } catch (error) {
      console.error('Error in getGroupEnrolmentPrintDetail controller:', error);
      if (error instanceof NotFoundException || error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve group enrolment print details');
    }
  }
}
