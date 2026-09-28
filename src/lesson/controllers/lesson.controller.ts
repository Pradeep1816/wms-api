import { Controller, Get, Post, Put, Param, Body, Query, UseGuards, NotFoundException, BadRequestException, ValidationPipe, Req } from '@nestjs/common';
import { In } from 'typeorm';
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const utc = require('dayjs/plugin/utc');
dayjs.extend(customParseFormat);
dayjs.extend(utc);
import { LessonService } from '../services/lesson.service';
import { LessonValidationService } from '../services/lesson-validation.service';
import { LessonReviewService } from '../services/lesson-review.service';
import { LessonConfirmationService } from '../services/lesson-confirmation.service';
import { LessonTeacherChangeService } from '../services/lesson-teacher-change.service';
import { LessonStatusEnum } from '../enums/lesson-status';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { calculateNextWeekdayDateTime } from '../../utils/date-utils';
import { ValidatePrivateLessonRequestDto } from '../dto/validate-private-lesson-request.dto';
import { ValidateLessonUpdateRequestDto } from '../dto/validate-lesson-update-request.dto';
import { UpdateLessonRequestDto } from '../dto/update-lesson-request.dto';
import { UpdateLessonFieldRequestDto } from '../dto/update-lesson-field-request.dto';

@Controller('admin/v2/:location/lesson')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class LessonController {
  constructor(
    private readonly lessonService: LessonService,
    private readonly lessonValidationService: LessonValidationService,
    private readonly lessonReviewService: LessonReviewService,
    private readonly lessonConfirmationService: LessonConfirmationService,
    private readonly lessonTeacherChangeService: LessonTeacherChangeService,
  ) {}

  /**
   * Get lesson review data for a course
   * Matches legacy: GET /lesson/review?LessonReview[courseId]=X
   * NOTE: This route must be defined BEFORE @Get(':id') to avoid route conflicts
   */
  @Get('review')
  @Roles(RolesEnum.BACKEND_USER)
  async getLessonReview(
    @LocationId() locationId: number,
    @Query('courseId') courseId?: string,
    @Query('showAllReviewLessons') showAllReviewLessons?: string,
  ): Promise<any> {
    try {
      if (!courseId) {
        return ResponseHelper.errors.BAD_REQUEST('courseId is required');
      }

      const courseIdNumber = parseInt(courseId, 10);
      if (isNaN(courseIdNumber)) {
        return ResponseHelper.errors.BAD_REQUEST('Invalid courseId parameter');
      }

      const showAll = showAllReviewLessons === '1' || showAllReviewLessons === 'true';
      
      const reviewData = await this.lessonReviewService.getLessonReview(
        courseIdNumber,
        locationId,
        showAll,
      );

      return ResponseHelper.success(reviewData, 'Lesson review data retrieved successfully');
    } catch (error) {
      console.error('Error in getLessonReview controller:', error);
      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve lesson review data');
    }
  }

  /**
   * Get lesson review data for teacher change (bulk teacher change scenario)
   * Matches legacy: GET /lesson/review?LessonReview[enrolmentIds][]=X&LessonReview[teacherId]=Y&LessonReview[changesFrom]=Z
   * NOTE: This is a separate endpoint to avoid confusion with existing course-based review
   */
  @Get('review-teacher-change')
  @Roles(RolesEnum.BACKEND_USER)
  async getLessonReviewForTeacherChange(
    @LocationId() locationId: number,
    @Query('enrolmentIds') enrolmentIds?: string | string[],
    @Query('teacherId') teacherId?: string,
    @Query('changesFrom') changesFrom?: string,
    @Query('isBulkTeacherChange') isBulkTeacherChange?: string,
    @Query() allQuery?: any, // Get all query params to handle bracket notation
  ): Promise<any> {
    try {
      // Parse enrolmentIds from query params (handles multiple formats)
      let enrolmentIdsArray: number[] = [];
      
      // Try standard format: enrolmentIds=31414 or enrolmentIds=31414&enrolmentIds=31415
      if (enrolmentIds) {
        enrolmentIdsArray = Array.isArray(enrolmentIds) 
          ? enrolmentIds.map(id => parseInt(String(id), 10))
          : [parseInt(String(enrolmentIds), 10)];
      }
      // Handle bracket notation: LessonReview[enrolmentIds][0]=31414 (legacy format)
      else if (allQuery) {
        // Try legacy format: LessonReview[enrolmentIds][0]
        const legacyKeys = Object.keys(allQuery).filter(key => 
          key.startsWith('LessonReview[enrolmentIds][') && key.endsWith(']')
        );
        if (legacyKeys.length > 0) {
          enrolmentIdsArray = legacyKeys
            .map(key => {
              // Extract index from key like "LessonReview[enrolmentIds][0]"
              const match = key.match(/LessonReview\[enrolmentIds\]\[(\d+)\]/);
              return match ? { index: parseInt(match[1], 10), value: allQuery[key] } : null;
            })
            .filter(item => item !== null)
            .sort((a, b) => a!.index - b!.index)
            .map(item => parseInt(String(item!.value), 10))
            .filter(id => !isNaN(id));
        } else {
          // Try standard bracket notation: enrolmentIds[0]
          const standardKeys = Object.keys(allQuery).filter(key => 
            key.startsWith('enrolmentIds[') && key.endsWith(']')
          );
          if (standardKeys.length > 0) {
            enrolmentIdsArray = standardKeys
              .map(key => {
                // Extract index from key like "enrolmentIds[0]"
                const match = key.match(/enrolmentIds\[(\d+)\]/);
                return match ? { index: parseInt(match[1], 10), value: allQuery[key] } : null;
              })
              .filter(item => item !== null)
              .sort((a, b) => a!.index - b!.index)
              .map(item => parseInt(String(item!.value), 10))
              .filter(id => !isNaN(id));
          }
        }
      }

      if (enrolmentIdsArray.length === 0) {
        return ResponseHelper.errors.BAD_REQUEST('enrolmentIds is required');
      }

      if (enrolmentIdsArray.some(id => isNaN(id))) {
        return ResponseHelper.errors.BAD_REQUEST('Invalid enrolmentIds parameter');
      }

      // Parse teacherId from query params (handle legacy bracket notation)
      let teacherIdNumber: number | undefined;
      if (teacherId) {
        teacherIdNumber = parseInt(teacherId, 10);
      } else if (allQuery) {
        // Try legacy format: LessonReview[teacherId]
        const legacyTeacherId = allQuery['LessonReview[teacherId]'];
        if (legacyTeacherId) {
          teacherIdNumber = parseInt(String(legacyTeacherId), 10);
        }
      }

      // Parse changesFrom from query params (handle legacy bracket notation)
      let changesFromDate: string | undefined = changesFrom;
      if (!changesFromDate && allQuery) {
        // Try legacy format: LessonReview[changesFrom] (format: "Feb 02, 2026")
        const legacyChangesFrom = allQuery['LessonReview[changesFrom]'];
        if (legacyChangesFrom) {
          // Parse date format like "Feb 02, 2026" to "2026-02-02"
          try {
            const parsedDate = new Date(legacyChangesFrom);
            if (!isNaN(parsedDate.getTime())) {
              changesFromDate = parsedDate.toISOString().split('T')[0];
            }
          } catch (e) {
            // If parsing fails, use as-is
            changesFromDate = String(legacyChangesFrom);
          }
        }
      }

      if (!changesFromDate) {
        return ResponseHelper.errors.BAD_REQUEST('changesFrom is required');
      }

      const isBulkChange = isBulkTeacherChange === 'true' || isBulkTeacherChange === '1' || 
                         allQuery?.['LessonReview[isBulkTeacherChange]'] === '1';
      
      const reviewData = await this.lessonReviewService.getLessonReviewForEnrolments(
        locationId,
        enrolmentIdsArray,
        teacherIdNumber,
        changesFromDate,
        isBulkChange,
      );

      return ResponseHelper.success(reviewData, 'Lesson review data for teacher change retrieved successfully');
    } catch (error) {
      console.error('Error in getLessonReviewForTeacherChange controller:', error);
      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve lesson review data for teacher change');
    }
  }

  /**
   * Confirm lessons created for a new enrolment.
   * Permanent schedule changes have a dedicated enrolment endpoint.
   */
  @Post('confirm')
  @Roles(RolesEnum.BACKEND_USER)
  async confirmLessons(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Req() req: any,
    @Query('courseId') courseId?: string,
  ): Promise<any> {
    
    try {
      const userId = req.user?.id;

      if (!courseId) {
        return ResponseHelper.errors.BAD_REQUEST('courseId is required');
      }

      const courseIdNumber = parseInt(courseId, 10);
      if (isNaN(courseIdNumber)) {
        return ResponseHelper.errors.BAD_REQUEST('Invalid courseId parameter');
      }

      const enrolmentId = await this.lessonConfirmationService.confirmLessonsForCourse(
        courseIdNumber,
        locationId,
        userId,
        locationSlug,
      );

      console.log('[confirmLessons] course confirmation completed', {
        courseIdNumber,
        locationId,
        userId,
      });

      return ResponseHelper.success(
        { enrolmentId },
        'Lessons confirmed successfully'
      );
    } catch (error) {
      console.error('Error in confirmLessons controller:', error);
      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }
      if (error.message.includes('Invalid')) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to confirm lessons');
    }
  }

  /**
   * Confirm teacher change for enrolments (bulk teacher change scenario)
   * Matches legacy: POST /lesson/confirm?LessonConfirm[enrolmentIds][]=X&LessonConfirm[teacherId]=Y&LessonConfirm[changesFrom]=Z
   * NOTE: This is a separate endpoint to avoid confusion with existing course-based confirmation
   */
  @Post('confirm-teacher-change')
  @Roles(RolesEnum.BACKEND_USER)
  async confirmTeacherChange(
    @LocationId() locationId: number,
    @Req() req: any,
    @Body() body?: any,
    @Query('enrolmentIds') enrolmentIds?: string | string[],
    @Query('teacherId') teacherId?: string,
    @Query('changesFrom') changesFrom?: string,
    @Query() allQuery?: any, // Get all query params to handle bracket notation
  ): Promise<any> {
    
    try {
      const userId = req.user?.id;

      // Parse enrolmentIds from query params (handles multiple formats)
      let enrolmentIdsArray: number[] = [];

      // Try standard format: enrolmentIds=1&enrolmentIds=2 (Nest parses to string | string[])
      if (enrolmentIds) {
        enrolmentIdsArray = Array.isArray(enrolmentIds)
          ? enrolmentIds.map((id) => parseInt(String(id), 10))
          : [parseInt(String(enrolmentIds), 10)];
      } else if (body?.enrolmentIds && Array.isArray(body.enrolmentIds)) {
        enrolmentIdsArray = body.enrolmentIds
          .map((id: any) => parseInt(String(id), 10))
          .filter((id: number) => !isNaN(id));
      }
      // Handle bracket notation: LessonConfirm[enrolmentIds][0]=31522 (legacy format)
      else if (allQuery) {
        // Try legacy format: LessonConfirm[enrolmentIds][0]
        const legacyKeys = Object.keys(allQuery).filter(key => 
          key.startsWith('LessonConfirm[enrolmentIds][') && key.endsWith(']')
        );
        if (legacyKeys.length > 0) {
          enrolmentIdsArray = legacyKeys
            .map(key => {
              // Extract index from key like "LessonConfirm[enrolmentIds][0]"
              const match = key.match(/LessonConfirm\[enrolmentIds\]\[(\d+)\]/);
              return match ? { index: parseInt(match[1], 10), value: allQuery[key] } : null;
            })
            .filter(item => item !== null)
            .sort((a, b) => a!.index - b!.index)
            .map(item => parseInt(String(item!.value), 10))
            .filter(id => !isNaN(id));
        }
      }

      if (enrolmentIdsArray.length === 0) {
        return ResponseHelper.errors.BAD_REQUEST('enrolmentIds is required');
      }

      if (enrolmentIdsArray.some(id => isNaN(id))) {
        return ResponseHelper.errors.BAD_REQUEST('Invalid enrolmentIds parameter');
      }

      // Parse teacherId from query params (handle legacy bracket notation)
      let teacherIdNumber: number | undefined;
      if (teacherId) {
        teacherIdNumber = parseInt(teacherId, 10);
      } else if (body?.teacherId) {
        teacherIdNumber = parseInt(String(body.teacherId), 10);
      } else if (allQuery) {
        // Try legacy format: LessonConfirm[teacherId]
        const legacyTeacherId = allQuery['LessonConfirm[teacherId]'];
        if (legacyTeacherId) {
          teacherIdNumber = parseInt(String(legacyTeacherId), 10);
        }
      }

      if (!teacherIdNumber || isNaN(teacherIdNumber)) {
        return ResponseHelper.errors.BAD_REQUEST('teacherId is required and must be a valid number');
      }

      // Parse changesFrom from query params (handle legacy bracket notation)
      let changesFromDate: string | undefined = changesFrom;
      if (!changesFromDate && body?.changesFrom) {
        changesFromDate = body.changesFrom;
      } else if (!changesFromDate && allQuery) {
        // Try legacy format: LessonConfirm[changesFrom] (format: "Feb 02, 2026")
        const legacyChangesFrom = allQuery['LessonConfirm[changesFrom]'];
        if (legacyChangesFrom) {
          // Parse date format like "Feb 02, 2026" to "2026-02-02"
          try {
            const parsedDate = new Date(legacyChangesFrom);
            if (!isNaN(parsedDate.getTime())) {
              changesFromDate = parsedDate.toISOString().split('T')[0];
            }
          } catch (e) {
            // If parsing fails, use as-is
            changesFromDate = String(legacyChangesFrom);
          }
        }
      }

      if (!changesFromDate) {
        return ResponseHelper.errors.BAD_REQUEST('changesFrom is required');
      }

      console.log('[confirmTeacherChange] request', {
        enrolmentIdsArray,
        teacherIdNumber,
        changesFromDate,
        locationId,
        userId,
      });

      // Confirm teacher change in one transaction so the batch is all-or-nothing.
      await this.lessonTeacherChangeService.confirmTeacherChangeForEnrolments(
        enrolmentIdsArray,
        teacherIdNumber,
        changesFromDate,
        locationId,
        userId,
      );

      console.log('[confirmTeacherChange] teacher change confirmed', {
        enrolmentIdsArray,
        locationId,
        userId,
      });

      return ResponseHelper.success(
        { message: "Future lesson's teacher have been changed successfully" },
        'Teacher change confirmed successfully'
      );
    } catch (error) {
      console.error('Error in confirmTeacherChange controller:', error);
      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to confirm teacher change');
    }
  }

  /**
   * Validate private lesson
   */
  @Post('validate-private')
  @Roles(RolesEnum.BACKEND_USER)
  async validatePrivateLesson(
    @LocationId() locationId: number,
    @Query('studentId') studentId: string,
    @Body(ValidationPipe) body: ValidatePrivateLessonRequestDto,
  ): Promise<any> {
    try {
      const studentIdNumber = parseInt(studentId, 10);
      if (isNaN(studentIdNumber)) {
        return ResponseHelper.errors.BAD_REQUEST('Invalid studentId parameter');
      }

      const result = await this.lessonValidationService.validatePrivateLesson(
        locationId,
        studentIdNumber,
        body,
      );

      if (result.success) {
        return ResponseHelper.success(null, result.message || 'Validation passed');
      } else {
        // Return validation errors in the format expected by frontend
        // Put errors in data field to match legacy ActiveForm::validate format
        return {
          success: false,
          errorCode: 'VALIDATION_ERROR',
          message: result.message || 'Validation failed',
          data: result.errors,
        };
      }
    } catch (error) {
      console.error('Error in validatePrivateLesson controller:', error);
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to validate lesson');
    }
  }

  /**
   * Validate lesson update (when editing lesson date/time/teacher)
   * Matches legacy: POST /lesson/validate-on-update?id=X
   * NOTE: This route must be defined BEFORE @Get(':id') to avoid route conflicts
   */
  @Post('validate-on-update')
  @Roles(RolesEnum.BACKEND_USER)
  async validateLessonUpdate(
    @LocationId() locationId: number,
    @Query('id') lessonId: string,
    @Body(ValidationPipe) body: ValidateLessonUpdateRequestDto,
  ): Promise<any> {
    try {
      const lessonIdNumber = parseInt(lessonId, 10);
      if (isNaN(lessonIdNumber)) {
        return ResponseHelper.errors.BAD_REQUEST('Invalid lessonId parameter');
      }

      // Ensure the lesson ID in body matches query parameter
      body.id = lessonIdNumber;

      const result = await this.lessonValidationService.validateLessonUpdate(
        locationId,
        lessonIdNumber,
        body,
      );

      if (result.success) {
        return ResponseHelper.success(null, result.message || 'Validation passed');
      } else {
        // Return validation errors in the format expected by frontend
        // Put errors in data field to match legacy ActiveForm::validate format
        return {
          success: false,
          errorCode: 'VALIDATION_ERROR',
          message: result.message || 'Validation failed',
          data: result.errors,
        };
      }
    } catch (error) {
      console.error('Error in validateLessonUpdate controller:', error);
      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to validate lesson update');
    }
  }

  /**
   * Update lesson field (date, time, teacher)
   * Matches legacy: POST /lesson/update-field?id=X&LessonReview[enrolmentIds]=
   * This endpoint handles both single lesson update and apply all functionality
   * 
   * Note: Legacy uses query parameter with brackets: LessonReview[enrolmentIds]
   * In NestJS, we access it via @Req() query object to handle bracket notation
   */
  @Post('update-field')
  @Roles(RolesEnum.BACKEND_USER)
  async updateLessonField(
    @LocationId() locationId: number,
    @Query('id') lessonId: string,
    @Body(ValidationPipe) body: UpdateLessonFieldRequestDto,
    @Req() req: any,
  ): Promise<any> {
    // Extract enrolmentIds from query params
    // Supports both legacy format (LessonReview[enrolmentIds]) and simplified format (enrolmentIds)
    // Note: Currently not used in logic, but kept for API compatibility
    const _enrolmentIds = req.query?.enrolmentIds || 
                         req.query?.['LessonReview[enrolmentIds]'] || 
                         req.query?.LessonReview?.['enrolmentIds'] || 
                         '';
    try {
      const lessonIdNumber = parseInt(lessonId, 10);
      if (isNaN(lessonIdNumber)) {
        return ResponseHelper.errors.BAD_REQUEST('Invalid lessonId parameter');
      }

      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.errors.UNAUTHORIZED('User not authenticated');
      }

      // Parse date from body (can be in various formats from legacy)
      // Legacy format: "Dec 28, 2025 04:00 PM" or "MMM dd, yyyy HH:mm AM/PM"
      let parsedDate: string | undefined;
      if (body.date) {
        // Try to parse the date string (legacy format: "MMM dd, yyyy HH:mm AM/PM")
        try {
          // Try parsing as legacy format first: "MMM dd, yyyy h:mm A"
          let dateObj = dayjs.utc(body.date, 'MMM DD, YYYY h:mm A', true);
          
          if (!dateObj.isValid()) {
            // Try alternative format: "MMM D, YYYY h:mm A" (single digit day)
            dateObj = dayjs.utc(body.date, 'MMM D, YYYY h:mm A', true);
          }
          
          if (!dateObj.isValid()) {
            // Try standard Date parsing
            dateObj = dayjs.utc(body.date);
          }
          
          if (dateObj.isValid()) {
            // If hour and minute are provided separately, use them (override parsed time)
            if (body.hour !== undefined && body.minute !== undefined) {
              const hour = parseInt(body.hour, 10);
              const minute = parseInt(body.minute, 10);
              dateObj = dateObj.hour(hour).minute(minute).second(0).millisecond(0);
            }
            parsedDate = dateObj.toISOString();
          } else {
            parsedDate = body.date; // Use as-is if parsing fails
          }
        } catch {
          parsedDate = body.date; // Use as-is if parsing fails
        }
      } else if (body.goToDate && body.hour !== undefined && body.minute !== undefined) {
        // Build date from goToDate + hour + minute
        // goToDate format: "MMM dd, yyyy" or "MMM d, yyyy"
        try {
          let dateObj = dayjs.utc(body.goToDate, 'MMM DD, YYYY', true);
          
          if (!dateObj.isValid()) {
            // Try single digit day format
            dateObj = dayjs.utc(body.goToDate, 'MMM D, YYYY', true);
          }
          
          if (!dateObj.isValid()) {
            // Fallback to standard parsing
            dateObj = dayjs.utc(body.goToDate);
          }
          
          if (dateObj.isValid()) {
            const hour = parseInt(body.hour, 10);
            const minute = parseInt(body.minute, 10);
            dateObj = dateObj.hour(hour).minute(minute).second(0).millisecond(0);
            parsedDate = dateObj.toISOString();
          } else {
            // Fallback: try standard Date parsing
            const dateObj = new Date(body.goToDate);
            const hour = parseInt(body.hour, 10);
            const minute = parseInt(body.minute, 10);
            dateObj.setUTCHours(hour, minute, 0, 0);
            parsedDate = dateObj.toISOString();
          }
        } catch {
          // Fallback: try standard parsing
          const dateObj = new Date(body.goToDate);
          const hour = parseInt(body.hour, 10);
          const minute = parseInt(body.minute, 10);
          dateObj.setUTCHours(hour, minute, 0, 0);
          parsedDate = dateObj.toISOString();
        }
      }

      // Build update request
      const updateData: UpdateLessonRequestDto & { status?: LessonStatusEnum } = {};
      if (parsedDate) {
        updateData.date = parsedDate;
      } else if (!body.goToDate && (!body.date || String(body.date).trim() === '')) {
        updateData.status = LessonStatusEnum.UNSCHEDULED;
      }
      if (body.teacherId) {
        updateData.teacherId = body.teacherId;
      }
      if (body.duration) {
        updateData.duration = body.duration;
      }

      // Check if this is "Apply All" (applyContext === '2' for apply all, '1' for apply single)
      // Legacy: applyContext = '2' means apply all, '1' means apply single
      const isApplyAll = body.applyContext === '2';

      if (isApplyAll) {
        // Legacy parity: Apply All updates only the lessons that are already
        // conflicted in the review, not every draft lesson in the course.
        const lesson = await this.lessonService.getLessonEntityById(lessonIdNumber, locationId);

        if (!lesson || !lesson.courseId) {
          return ResponseHelper.errors.NOT_FOUND('Lesson or course not found');
        }

        const review = await this.lessonReviewService.getLessonReview(
          lesson.courseId,
          locationId,
          true,
        );
        const conflictedLessons = review.lessons.filter((reviewLesson) => reviewLesson.isConflict);
        const targetDate = parsedDate ? new Date(parsedDate) : undefined;

        const updatePromises = conflictedLessons.map(async (reviewLesson) => {
          const lessonUpdateData: UpdateLessonRequestDto & { status?: LessonStatusEnum } = {};

          if (targetDate) {
            lessonUpdateData.date = calculateNextWeekdayDateTime(
              new Date(reviewLesson.date),
              targetDate,
            ).toISOString();
          } else {
            lessonUpdateData.status = LessonStatusEnum.UNSCHEDULED;
          }

          if (body.teacherId) {
            lessonUpdateData.teacherId = body.teacherId;
          }
          if (body.duration) {
            lessonUpdateData.duration = body.duration;
          }

          return this.lessonService.updateLesson(
            reviewLesson.id,
            locationId,
            lessonUpdateData,
            userId,
          );
        });

        const results = await Promise.all(updatePromises);
        const successCount = results.filter(r => r !== null).length;

        return ResponseHelper.success(
          {
            updatedCount: successCount,
            totalCount: conflictedLessons.length,
          },
          `${successCount} of ${conflictedLessons.length} lessons updated successfully`
        );
      } else {
        // Single lesson update
        const updatedLesson = await this.lessonService.updateLesson(
          lessonIdNumber,
          locationId,
          updateData,
          userId,
        );

        return ResponseHelper.success(
          {
            id: updatedLesson.id,
            date: updatedLesson.date,
            teacherId: updatedLesson.teacherId,
            duration: updatedLesson.duration,
          },
          'Lesson updated successfully'
        );
      }
    } catch (error) {
      console.error('Error in updateLessonField controller:', error);
      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to update lesson');
    }
  }

  @Get(':id')
  @Roles(RolesEnum.BACKEND_USER)
  async getLessonById(
    @LocationId() locationId: number,
    @Param('id') lessonId: number,
    @Param('location') locationSlug: string,
  ): Promise<any> {
    try {
      const data = await this.lessonService.getLessonById(
        lessonId,
        locationSlug,
        locationId,
      );

      return ResponseHelper.success(data, 'Lesson data retrieved successfully');
    } catch (error) {
      console.error('Error in getLessonEditSchedule controller:', error);
      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve lesson data');
    }
  }

  /**
   * Update lesson date, time, or teacher
   * Used for editing conflicted lessons from review page
   * Matches legacy: POST /lesson/update
   */
  @Put(':id')
  @Roles(RolesEnum.BACKEND_USER)
  async updateLesson(
    @LocationId() locationId: number,
    @Param('id') lessonId: number,
    @Body(ValidationPipe) updateData: UpdateLessonRequestDto,
    @Req() req: any,
  ): Promise<any> {
    try {
      const lessonIdNumber = parseInt(lessonId.toString(), 10);
      if (isNaN(lessonIdNumber)) {
        return ResponseHelper.errors.BAD_REQUEST('Invalid lessonId parameter');
      }

      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.errors.UNAUTHORIZED('User not authenticated');
      }

      const updatedLesson = await this.lessonService.updateLesson(
        lessonIdNumber,
        locationId,
        updateData,
        userId,
      );

      return ResponseHelper.success(
        {
          id: updatedLesson.id,
          date: updatedLesson.date,
          teacherId: updatedLesson.teacherId,
          duration: updatedLesson.duration,
        },
        'Lesson updated successfully'
      );
    } catch (error) {
      console.error('Error in updateLesson controller:', error);
      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to update lesson');
    }
  }
}
