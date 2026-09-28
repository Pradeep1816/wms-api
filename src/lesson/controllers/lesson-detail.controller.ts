import { Controller, Get, Put, Param, Body, Query, UseGuards, ValidationPipe, NotFoundException, BadRequestException, ParseIntPipe } from '@nestjs/common';
import { LessonDetailService } from '../services/lesson-detail.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { UpdateLessonDetailsRequestDto } from '../dto/update-lesson-details-request.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/services/auth.service';
import { EditLessonDueDateDto } from '../dto/edit-lesson-due-date.dto';
import { EditLessonCostDto } from '../dto/edit-lesson-cost.dto';
import { LessonPaymentRequestDto } from '../dto/lesson-payment-request.dto';

@Controller('admin/v2/:location/lesson')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class LessonDetailController {
  constructor(
    private readonly lessonDetailService: LessonDetailService,
  ) {}

  @Get('details/:id')
  @Roles(RolesEnum.BACKEND_USER)
  async getLessonDetail(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') lessonId: number,
  ): Promise<any> {
    try {
      const lessonDetail = await this.lessonDetailService.getLessonDetails(
        locationId, 
        locationSlug, 
        lessonId
      );

      return ResponseHelper.success(lessonDetail, 'Lesson detail retrieved successfully');
    } catch (error) {
      console.error('Error in getLessonDetail controller:', error);
      
      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve lesson detail');
    }
  }

  @Get('details/:id/group-students')
  @Roles(RolesEnum.BACKEND_USER)
  async getGroupLessonStudents(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') lessonId: number,
  ): Promise<any> {
    try {
      const result = await this.lessonDetailService.getGroupLessonStudentsTab(
        locationId,
        locationSlug,
        lessonId,
      );

      return ResponseHelper.success(result, 'Group lesson students retrieved successfully');
    } catch (error) {
      console.error('Error in getGroupLessonStudents controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve group lesson students');
    }
  }

  @Get('details/:id/payments')
  @Roles(RolesEnum.BACKEND_USER)
  async getGroupLessonPayments(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id', ParseIntPipe) lessonId: number,
    @Query(ValidationPipe) query: LessonPaymentRequestDto,
  ): Promise<any> {
    try {
      if (!query.enrolmentId) {
        return ResponseHelper.error('BAD_REQUEST', 'enrolmentId is required');
      }

      const result = await this.lessonDetailService.getGroupLessonPayments(
        locationId,
        locationSlug,
        lessonId,
        query.enrolmentId,
        query.sort,
        query.order,
      );

      return ResponseHelper.success(result, 'Group lesson payments retrieved successfully');
    } catch (error) {
      console.error('Error in getGroupLessonPayments controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve group lesson payments');
    }
  }

  /**
   * Update lesson details (classroom, colorCode, isOnline)
   */
  @Put('details/:id')
  @Roles(RolesEnum.BACKEND_USER)
  async updateLessonDetails(
    @LocationId() locationId: number,
    @Param('id') lessonId: number,
    @Body(ValidationPipe) updateData: UpdateLessonDetailsRequestDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const updatedLesson = await this.lessonDetailService.updateLessonDetails(
        lessonId,
        locationId,
        updateData,
        currentUser.id,
      );

      return ResponseHelper.success(
        {
          id: updatedLesson.id,
          classroomId: updatedLesson.classroomId,
          colorCode: updatedLesson.colorCode,
          isOnline: updatedLesson.isOnline ? 'Yes' : 'No',
        },
        'Lesson details updated successfully'
      );
    } catch (error) {
      console.error('Error in updateLessonDetails controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to update lesson details'
      );
    }
  }

  /**
   * Update lesson due date (date-only)
   */
  @Put(':id/due-date')
  @Roles(RolesEnum.BACKEND_USER)
  async updateLessonDueDate(
    @LocationId() locationId: number,
    @Param('id') lessonId: number,
    @Body(ValidationPipe) body: EditLessonDueDateDto,
  ): Promise<any> {
    try {
      const result = await this.lessonDetailService.updateLessonDueDate(lessonId, locationId, body.dueDate);

      return ResponseHelper.success(result, 'Lesson due date updated successfully');
    } catch (error) {
      console.error('Error in updateLessonDueDate controller:', error);
      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }
      return ResponseHelper.errors.INTERNAL_ERROR(
        error.message || 'Failed to update lesson due date',
      );
    }
  }

  /**
   * Update lesson cost (teacherRate)
   */
  @Put(':id/edit-cost')
  @Roles(RolesEnum.BACKEND_USER)
  async updateLessonCost(
    @LocationId() locationId: number,
    @Param('id') lessonId: number,
    @Body(ValidationPipe) body: EditLessonCostDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const updatedCost = await this.lessonDetailService.updateLessonCost(lessonId, locationId, body.teacherRate, currentUser.id);

      return ResponseHelper.success(updatedCost, 'Cost updated successfully');
    } catch (error) {
      console.error('Error in updateLessonCost controller:', error);
      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }
      return ResponseHelper.errors.INTERNAL_ERROR(
        error.message || 'Failed to update lesson cost',
      );
    }
  }
}
