import { Controller, Get, Post, Delete, Query, Body, UseGuards, ValidationPipe, Param, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { EnrolmentSearchDto } from '../dto/enrolment-list-request.dto';
import { EnrolmentListResponseDto } from '../dto/enrolment-list-response.dto';
import { EnrolmentService } from '../services/enrolment.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { GroupCourseFormDto } from '../dto/group-course-form.dto';
import { GroupEnrolmentConfirmRequestDto } from '../dto/group-enrolment-confirm-request.dto';
import { UpdateEnrolmentDiscountsRequestDto } from '../dto/update-enrolment-discounts-request.dto';
import { UpdateGroupEnrolmentDiscountRequestDto } from '../dto/update-group-enrolment-discount-request.dto';
import { ChangeTeacherRequestDto } from '../dto/change-teacher-request.dto';
import { EnrolmentTeacherChangeService } from '../services/enrolment-teacher-change.service';

interface RequestWithUser {
  user?: {
    id?: number;
  };
}

@Controller('admin/v2/:location/enrolments')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class EnrolmentListController {
  constructor(
    private readonly enrolmentService: EnrolmentService,
    private readonly enrolmentTeacherChangeService: EnrolmentTeacherChangeService,
  ) {}

  @Get('list')
  @Roles(RolesEnum.BACKEND_USER)
  async getEnrolmentsList(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: EnrolmentSearchDto,
  ): Promise<EnrolmentListResponseDto | any> {
    try {
      const result = await this.enrolmentService.getEnrolmentsList(
        locationId,
        query,
      );
      return ResponseHelper.success(result, 'Enrolments retrieved successfully');
    } catch (error) {
      console.error('Error in getEnrolmentsList controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve enrolments');
    }
  }

  /**
   * Apply group enrolment - creates unconfirmed enrolment, applies discount, returns lesson preview
   * POST /admin/v2/:location/enrolments/group-apply
   * Matches legacy: EnrolmentController::actionGroupApply()
   */
  @Post('group-apply')
  @Roles(RolesEnum.BACKEND_USER)
  async applyGroupEnrolment(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: GroupCourseFormDto,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: GroupCourseFormDto,
    @Req() req: any,
  ): Promise<any> {
    try {
      const loggedUserId = req.user?.id;
      if (!loggedUserId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      // Merge query params and body (legacy loads from both GET and POST)
      const groupCourseForm: GroupCourseFormDto = {
        studentId: body.studentId || query.studentId,
        courseId: body.courseId || query.courseId,
        enrolmentId: body.enrolmentId || query.enrolmentId,
        discount: body.discount || query.discount,
        discountType: body.discountType ?? query.discountType ?? 1, // Default to DOLLAR
      };

      if (!groupCourseForm.studentId || !groupCourseForm.courseId) {
        return ResponseHelper.error('BAD_REQUEST', 'Student ID and Course ID are required');
      }

      const result = await this.enrolmentService.applyGroupEnrolment(
        locationId,
        groupCourseForm,
        loggedUserId,
      );

      return ResponseHelper.success(result, 'Group enrolment applied successfully');
    } catch (error) {
      console.error('Error in applyGroupEnrolment controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message?.includes('required') || error.message?.includes('Invalid')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to apply group enrolment');
    }
  }

  /**
   * Confirm group enrolment - sets isConfirmed=true and creates GroupLesson records
   * POST /admin/v2/:location/enrolments/group-confirm?enrolmentId=X
   * Matches legacy: EnrolmentController::actionGroupConfirm()
   */
  @Post('group-confirm')
  @Roles(RolesEnum.BACKEND_USER)
  async confirmGroupEnrolment(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: GroupEnrolmentConfirmRequestDto,
    @Req() req: any,
  ): Promise<any> {
    try {
      const loggedUserId = req.user?.id;
      if (!loggedUserId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      if (!query.enrolmentId) {
        return ResponseHelper.error('BAD_REQUEST', 'Enrolment ID is required');
      }

      const result = await this.enrolmentService.confirmGroupEnrolment(
        locationId,
        locationSlug,
        query.enrolmentId,
        loggedUserId,
      );

      return ResponseHelper.success(result, 'Group enrolment confirmed successfully');
    } catch (error) {
      console.error('Error in confirmGroupEnrolment controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message?.includes('required')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to confirm group enrolment');
    }
  }

  /**
   * Delete enrolment - deletes private enrolment and reverts lesson credits
   * DELETE /admin/v2/:location/enrolments/:id
   * Matches legacy: EnrolmentController::actionDelete()
   */
  @Delete(':id')
  @Roles(RolesEnum.BACKEND_USER)
  async deleteEnrolment(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Param('id') enrolmentId: number,
    @Req() req: RequestWithUser,
  ): Promise<any> {
    try {
      const result = await this.enrolmentService.deleteEnrolment(
        locationId,
        enrolmentId,
        locationSlug,
        req.user?.id,
      );

      if (result.status) {
        return ResponseHelper.success(result, result.message || 'Enrolment deleted successfully');
      } else {
        return ResponseHelper.error('BAD_REQUEST', 'You are not allowed to delete this enrolment.');
      }
    } catch (error) {
      console.error('Error in deleteEnrolment controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to delete enrolment');
    }
  }

  /**
   * Delete group enrolment - deletes group enrolment if no invoices or payments
   * DELETE /admin/v2/:location/enrolments/:id/group
   * Matches legacy: EnrolmentController::actionGroupEnrolmentDelete()
   */
  @Delete(':id/group')
  @Roles(RolesEnum.BACKEND_USER)
  async deleteGroupEnrolment(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Param('id') enrolmentId: number,
  ): Promise<any> {
    try {
      const result = await this.enrolmentService.deleteGroupEnrolment(
        locationId,
        enrolmentId,
        locationSlug,
      );

      if (result.status) {
        return ResponseHelper.success(result, result.message || 'Group enrolment deleted successfully');
      } else {
        return ResponseHelper.error('BAD_REQUEST', result.error || 'You are not allowed to delete this enrolment.');
      }
    } catch (error) {
      console.error('Error in deleteGroupEnrolment controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to delete group enrolment');
    }
  }

  /**
   * Get delete preview - shows what will be deleted when deleting an enrolment
   * GET /admin/v2/:location/enrolments/:id/delete-preview
   * Matches legacy: EnrolmentController::actionFullDelete() (GET request)
   */
  @Get(':id/delete-preview')
  @Roles(RolesEnum.BACKEND_USER)
  async getDeletePreview(
    @LocationId() locationId: number,
    @Param('id') enrolmentId: number,
  ): Promise<any> {
    try {
      const result = await this.enrolmentService.getDeletePreview(
        locationId,
        enrolmentId,
      );

      return ResponseHelper.success(result, 'Delete preview retrieved successfully');
    } catch (error) {
      console.error('Error in getDeletePreview controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message?.includes('only available')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve delete preview');
    }
  }

  /**
   * Get discount preview - shows what will be modified when editing enrolment discounts
   * GET /admin/v2/:location/enrolments/:id/discount-preview
   * Matches legacy: Enrolment::getPreviewDataProvider()
   */
  @Get(':id/discount-preview')
  @Roles(RolesEnum.BACKEND_USER)
  async getDiscountPreview(
    @LocationId() locationId: number,
    @Param('id') enrolmentId: number,
  ): Promise<any> {
    try {
      const result = await this.enrolmentService.getDiscountPreview(
        locationId,
        enrolmentId,
      );

      return ResponseHelper.success(result, 'Discount preview retrieved successfully');
    } catch (error) {
      console.error('Error in getDiscountPreview controller:', error);
      
      // Handle BadRequestException (validation errors)
      if (error.status === 400 || error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message || "You can't edit discounts.");
      }
      
      // Handle NotFoundException
      if (error.status === 404 || error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve discount preview');
    }
  }

  /**
   * Update private enrolment discounts - updates payment frequency and multiple enrolment discounts
   * POST /admin/v2/:location/enrolments/:id/discounts
   * Matches legacy: EnrolmentController::actionEdit() (POST request) - for private enrolments only
   */
  @Post(':id/discounts')
  @Roles(RolesEnum.BACKEND_USER)
  async updateEnrolmentDiscounts(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Param('id') enrolmentId: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: UpdateEnrolmentDiscountsRequestDto,
    @Req() req: any,
  ): Promise<any> {
    try {
      const loggedUserId = req.user?.id;
      if (!loggedUserId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const result = await this.enrolmentService.updateEnrolmentDiscounts(
        locationId,
        locationSlug,
        enrolmentId,
        body,
        loggedUserId,
      );

      return ResponseHelper.success(result, result.message || 'Discounts updated successfully');
    } catch (error) {
      console.error('Error in updateEnrolmentDiscounts controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message?.includes('private enrolment discounts only')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      if (error.message?.includes("can't edit discounts") || error.message?.includes('required')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to update discounts');
    }
  }

  /**
   * Update group enrolment discount - updates discount and discountType for group enrolments
   * POST /admin/v2/:location/enrolments/:id/group-discount
   * Matches legacy: GroupEnrolmentController::actionEditDiscount() (POST request)
   */
  @Post(':id/group-discount')
  @Roles(RolesEnum.BACKEND_USER)
  async updateGroupEnrolmentDiscount(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Param('id') enrolmentId: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: UpdateGroupEnrolmentDiscountRequestDto,
    @Req() req: any,
  ): Promise<any> {
    try {
      const loggedUserId = req.user?.id;
      if (!loggedUserId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const result = await this.enrolmentService.updateGroupEnrolmentDiscount(
        locationId,
        locationSlug,
        enrolmentId,
        body,
        loggedUserId,
      );

      return ResponseHelper.success(result, result.message || 'Group discount updated successfully');
    } catch (error) {
      console.error('Error in updateGroupEnrolmentDiscount controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message?.includes('group enrolment discounts only')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      if (error.message?.includes("can't edit discounts")) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to update group discount');
    }
  }

  /**
   * Full delete enrolment - deletes enrolment with all transactional data
   * POST /admin/v2/:location/enrolments/:id/full-delete
   * Matches legacy: EnrolmentController::actionFullDelete() (POST request)
   */
  @Post(':id/full-delete')
  @Roles(RolesEnum.BACKEND_USER)
  async fullDeleteEnrolment(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Param('id') enrolmentId: number,
  ): Promise<any> {
    try {
      const result = await this.enrolmentService.fullDeleteEnrolment(
        locationId,
        enrolmentId,
        locationSlug,
      );

      if (result.status) {
        return ResponseHelper.success(result, result.message || 'Enrolment fully deleted successfully');
      } else {
        return ResponseHelper.error('BAD_REQUEST', result.error || 'You are not allowed to delete this enrolment.');
      }
    } catch (error) {
      console.error('Error in fullDeleteEnrolment controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to fully delete enrolment');
    }
  }

  /**
   * Change teacher for enrolments - creates draft lessons with new teacher
   * POST /admin/v2/:location/enrolments/change-teacher
   * Matches legacy: TeacherSubstituteController::actionEnrolment() (POST request)
   */
  @Post('change-teacher')
  @Roles(RolesEnum.BACKEND_USER)
  async changeTeacherForEnrolments(
    @LocationId() locationId: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: ChangeTeacherRequestDto,
    @Req() req: any,
  ): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const result = await this.enrolmentTeacherChangeService.changeTeacherForEnrolments(
        locationId,
        body,
        userId,
      );

      return ResponseHelper.success(result, result.message || 'Teacher changed successfully');
    } catch (error) {
      console.error('Error in changeTeacherForEnrolments controller:', error);
      if (error instanceof BadRequestException || error.status === 400) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      if (error.message?.includes('not found') || error.status === 404) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message?.includes('required') || error.message?.includes('Invalid')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to change teacher for enrolments');
    }
  }
}
