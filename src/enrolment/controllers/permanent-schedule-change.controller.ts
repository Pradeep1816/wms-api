/**
 * HTTP endpoints for previewing, drafting, and reviewing permanent schedule
 * changes (PSC). Business decisions remain in the enrolment PSC service; this
 * controller only validates transport input and maps results to API responses.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import {
  PermanentScheduleChangeConfirmRequestDto,
  PermanentScheduleChangeRequestDto,
  RescheduleRequestDto,
} from '../dto/permanent-schedule-change/permanent-schedule-change-request.dto';
import { PermanentScheduleChangeReviewRequestDto } from '../dto/permanent-schedule-change/permanent-schedule-change-review-request.dto';
import { PermanentScheduleChangeService } from '../services/permanent-schedule-change.service';

interface AuthenticatedRequest {
  user?: {
    id?: number;
  };
}

/** Exposes the enrolment-owned permanent schedule change API. */
@Controller('admin/v2/:location/enrolments/:id/permanent-schedule-change')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class PermanentScheduleChangeController {
  /** Inject the single application service used by every PSC endpoint. */
  constructor(
    private readonly permanentScheduleChangeService: PermanentScheduleChangeService,
  ) {}

  /** Return the initial preview or the month-specific PSC details. */
  @Get('preview')
  @Roles(RolesEnum.BACKEND_USER)
  async getPreview(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) enrolmentId: number,
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        skipMissingProperties: true,
      }),
    )
    query: PermanentScheduleChangeRequestDto,
  ): Promise<unknown> {
    try {
      const result = await this.permanentScheduleChangeService.getPreview(
        locationId,
        enrolmentId,
        query,
      );
      const message = query.startMonth
        ? 'Detail data retrieved successfully'
        : 'Preview data retrieved successfully';
      return ResponseHelper.success({ body: result }, message);
    } catch (error: unknown) {
      console.error(
        'Error in getPermanentScheduleChangePreview controller:',
        error,
      );
      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve data',
      );
    }
  }

  /** Replace the current PSC draft with lessons using the requested schedule. */
  @Post('reschedule')
  @Roles(RolesEnum.BACKEND_USER)
  async reschedule(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) enrolmentId: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: RescheduleRequestDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    try {
      const loggedUserId = request.user?.id;
      if (!loggedUserId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const result = await this.permanentScheduleChangeService.reschedule(
        locationId,
        enrolmentId,
        body,
        loggedUserId,
      );
      return ResponseHelper.success(
        { body: result },
        'Lessons rescheduled successfully',
      );
    } catch (error: unknown) {
      console.error('Error in reschedule controller:', error);
      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to reschedule lessons',
      );
    }
  }

  /** Return conflicts and lesson changes for the current PSC draft. */
  @Get('review')
  @Roles(RolesEnum.BACKEND_USER)
  async getReview(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) enrolmentId: number,
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        skipMissingProperties: true,
      }),
    )
    query: PermanentScheduleChangeReviewRequestDto,
  ): Promise<unknown> {
    try {
      if (!query.courseId) {
        return ResponseHelper.error('BAD_REQUEST', 'courseId is required');
      }

      const reviewData = await this.permanentScheduleChangeService.getReview(
        locationId,
        enrolmentId,
        query,
      );
      return ResponseHelper.success(
        reviewData,
        'Lesson review data retrieved successfully',
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      console.error(
        'Error in getPermanentScheduleChangeReview controller:',
        error,
      );
      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (
        error instanceof BadRequestException ||
        message.includes('Invalid') ||
        message.includes('required')
      ) {
        return ResponseHelper.error('BAD_REQUEST', message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        message || 'Failed to retrieve lesson review data',
      );
    }
  }

  /** Confirm the current PSC draft for this enrolment. */
  @Post('confirm')
  @Roles(RolesEnum.BACKEND_USER)
  async confirm(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) enrolmentId: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: PermanentScheduleChangeConfirmRequestDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    try {
      const loggedUserId = request.user?.id;
      if (!loggedUserId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const confirmedEnrolmentId =
        await this.permanentScheduleChangeService.confirm(
          locationSlug,
          locationId,
          enrolmentId,
          body,
          loggedUserId,
        );
      return ResponseHelper.success(
        { enrolmentId: confirmedEnrolmentId },
        'Lessons confirmed successfully',
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      console.error(
        'Error in permanent schedule confirmation controller:',
        error,
      );
      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (
        error instanceof BadRequestException ||
        message.includes('Invalid') ||
        message.includes('required')
      ) {
        return ResponseHelper.error('BAD_REQUEST', message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        message || 'Failed to confirm permanent schedule change',
      );
    }
  }
}
