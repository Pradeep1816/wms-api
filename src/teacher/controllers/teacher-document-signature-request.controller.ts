import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import type { AuthenticatedUser } from '../../auth/services/auth.service';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import {
  CreateTeacherDocumentSignatureRequestDto,
  RejectTeacherDocumentSignatureRequestDto,
  SignTeacherDocumentSignatureRequestDto,
  TeacherDocumentAnnualInvoiceHistoryQueryDto,
  TeacherDocumentPreviewQueryDto,
  TeacherDocumentSignatureRequestPreviewQueryDto,
  TeacherDocumentSignatureTrackingQueryDto,
  TeacherInvoicedLessonsBatchPreviewQueryDto,
  VoidTeacherDocumentSignatureRequestDto,
} from '../dto/teacher-document-signature-request.dto';
import { TeacherDocumentSignatureRequestStatus } from '../entities/teacher-document-signature-request.entity';
import { TeacherDocumentSignatureRequestService } from '../services/teacher-document-signature-request.service';

@Controller()
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class TeacherDocumentSignatureRequestController {
  constructor(
    private readonly service: TeacherDocumentSignatureRequestService,
  ) {}

  @Post('admin/v2/:location/teachers/:id/document-signature-requests')
  @Roles(RolesEnum.BACKEND_USER)
  async requestTeacherSignature(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Param('id') teacherId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(ValidationPipe) body: CreateTeacherDocumentSignatureRequestDto,
  ) {
    try {
      const result = await this.service.requestSignature(
        locationSlug,
        locationId,
        Number(teacherId),
        currentUser.id,
        body,
      );

      const message = this.getAdminMessage(result.created, result.body.status);
      return ResponseHelper.success(result, message);
    } catch (error) {
      console.error('Error requesting teacher document signature:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        this.getErrorMessage(error, 'Failed to request teacher signature'),
      );
    }
  }

  @Get('admin/v2/:location/teachers/:id/document-signature-requests/status')
  @Roles(RolesEnum.BACKEND_USER)
  async getTeacherSignatureRequestStatus(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Param('id') teacherId: string,
    @Query(ValidationPipe) query: CreateTeacherDocumentSignatureRequestDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
      const result = await this.service.getRequestForAdmin(
        locationSlug,
        locationId,
        Number(teacherId),
        query,
      );
      const response = this.isStaffMember(currentUser)
        ? this.service.redactAdminRequestStatusFinancialFields(result)
        : result;

      return ResponseHelper.success(
        response,
        'Signature request status retrieved successfully',
      );
    } catch (error) {
      console.error(
        'Error retrieving teacher document signature status:',
        error,
      );

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        this.getErrorMessage(
          error,
          'Failed to retrieve teacher signature status',
        ),
      );
    }
  }

  @Get(
    'admin/v2/:location/teachers/:id/document-signature-requests/active-status',
  )
  @Roles(RolesEnum.BACKEND_USER)
  async getTeacherActiveSignatureRequestStatus(
    @LocationId() locationId: number,
    @Param('id') teacherId: string,
    @Query(ValidationPipe) query: CreateTeacherDocumentSignatureRequestDto,
  ) {
    try {
      const result = await this.service.getActiveRequestForAdmin(
        locationId,
        Number(teacherId),
        query,
      );

      return ResponseHelper.success(
        result,
        'Active signature request status retrieved successfully',
      );
    } catch (error) {
      console.error(
        'Error retrieving active teacher document signature status:',
        error,
      );

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        this.getErrorMessage(
          error,
          'Failed to retrieve active teacher signature status',
        ),
      );
    }
  }

  @Get(
    'admin/v2/:location/teachers/:id/document-signature-requests/signed-overlaps',
  )
  @Roles(RolesEnum.BACKEND_USER)
  async getTeacherSignedSignatureRequestOverlaps(
    @LocationId() locationId: number,
    @Param('id') teacherId: string,
    @Query(ValidationPipe) query: CreateTeacherDocumentSignatureRequestDto,
  ) {
    try {
      const result = await this.service.getSignedOverlappingRequestsForAdmin(
        locationId,
        Number(teacherId),
        query,
      );

      return ResponseHelper.success(
        result,
        'Signed signature request overlaps retrieved successfully',
      );
    } catch (error) {
      console.error(
        'Error retrieving overlapping teacher document signatures:',
        error,
      );

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        this.getErrorMessage(
          error,
          'Failed to retrieve overlapping teacher signatures',
        ),
      );
    }
  }

  // Ad-hoc document preview for a teacher + period, without creating a request.
  // Backs the "Preview" action on the batch send screen so an admin can review
  // each instructor's invoice before sending.
  @Get(
    'admin/v2/:location/teachers/:id/document-signature-requests/document-preview',
  )
  @Roles(RolesEnum.BACKEND_USER)
  async getTeacherDocumentPreview(
    @Param('location') locationSlug: string,
    @Param('id') teacherId: string,
    @Query(ValidationPipe) query: TeacherDocumentPreviewQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
      const preview = await this.service.previewTeacherDocument(
        locationSlug,
        Number(teacherId),
        query,
      );
      const response = this.isStaffMember(currentUser)
        ? this.service.redactTeacherDocumentPreviewFinancialFields(preview)
        : preview;

      return ResponseHelper.success(
        response,
        'Teacher document preview retrieved successfully',
      );
    } catch (error) {
      console.error('Error retrieving teacher document preview:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        this.getErrorMessage(
          error,
          'Failed to retrieve teacher document preview',
        ),
      );
    }
  }

  @Post('admin/v2/:location/teacher-document-signature-requests/:id/resend')
  @Roles(RolesEnum.BACKEND_USER)
  async resendTeacherSignatureReminder(
    @LocationId() locationId: number,
    @Param('id') requestId: string,
  ) {
    try {
      const result = await this.service.resendSignatureReminder(
        locationId,
        Number(requestId),
      );

      return ResponseHelper.success(
        result,
        result.notification?.emailSent
          ? 'Reminder sent to teacher'
          : 'Reminder could not be emailed to the teacher',
      );
    } catch (error) {
      console.error('Error resending teacher signature reminder:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        this.getErrorMessage(error, 'Failed to resend signature reminder'),
      );
    }
  }

  @Patch('admin/v2/:location/teacher-document-signature-requests/:id/void')
  @Roles(RolesEnum.OWNER, RolesEnum.ADMINISTRATOR)
  async voidTeacherSignatureRequest(
    @LocationId() locationId: number,
    @Param('id') requestId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(ValidationPipe) body: VoidTeacherDocumentSignatureRequestDto,
  ) {
    try {
      const result = await this.service.voidSignatureRequest(
        locationId,
        Number(requestId),
        currentUser.id,
        body,
      );

      return ResponseHelper.success(result, 'Document voided');
    } catch (error) {
      console.error('Error voiding teacher signature request:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        this.getErrorMessage(error, 'Failed to void document'),
      );
    }
  }

  @Get('admin/v2/:location/teacher-document-signature-tracking')
  @Roles(RolesEnum.BACKEND_USER)
  async getTeacherSignatureTrackingReport(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: TeacherDocumentSignatureTrackingQueryDto,
  ) {
    try {
      const result = await this.service.getAdminSignatureTrackingReport(
        locationId,
        query,
      );

      return ResponseHelper.success(
        result,
        'Teacher signature tracking report retrieved successfully',
      );
    } catch (error) {
      console.error(
        'Error retrieving teacher signature tracking report:',
        error,
      );

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        this.getErrorMessage(
          error,
          'Failed to retrieve teacher signature tracking report',
        ),
      );
    }
  }

  @Get('admin/v2/:location/teacher-document-annual-invoice-history')
  @Roles(RolesEnum.BACKEND_USER)
  async getTeacherAnnualInvoiceHistory(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: TeacherDocumentAnnualInvoiceHistoryQueryDto,
  ) {
    try {
      const result = await this.service.getAdminAnnualInvoiceHistory(
        locationId,
        query,
      );

      return ResponseHelper.success(
        result,
        'Teacher annual invoice history retrieved successfully',
      );
    } catch (error) {
      console.error('Error retrieving teacher annual invoice history:', error);

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        this.getErrorMessage(
          error,
          'Failed to retrieve teacher annual invoice history',
        ),
      );
    }
  }

  // Declared before the ':id/preview' route below so the literal
  // 'invoiced-lessons-batch' segment is not captured as an :id param.
  @Get(
    'admin/v2/:location/teacher-document-signature-requests/invoiced-lessons-batch/preview',
  )
  @Roles(RolesEnum.BACKEND_USER)
  async previewInvoicedLessonsBatch(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: TeacherInvoicedLessonsBatchPreviewQueryDto,
  ) {
    try {
      const result = await this.service.previewInvoicedLessonsBatch(
        locationId,
        query,
      );

      return ResponseHelper.success(
        result,
        'Invoiced lessons batch preview retrieved successfully',
      );
    } catch (error) {
      console.error('Error building invoiced lessons batch preview:', error);

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        this.getErrorMessage(
          error,
          'Failed to build invoiced lessons batch preview',
        ),
      );
    }
  }

  // Declared before the ':id/preview' route below so the literal
  // 'time-voucher-batch' segment is not captured as an :id param.
  @Get(
    'admin/v2/:location/teacher-document-signature-requests/time-voucher-batch/preview',
  )
  @Roles(RolesEnum.BACKEND_USER)
  async previewTimeVoucherBatch(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: TeacherInvoicedLessonsBatchPreviewQueryDto,
  ) {
    try {
      const result = await this.service.previewTimeVoucherBatch(
        locationId,
        query,
      );

      return ResponseHelper.success(
        result,
        'Time voucher batch preview retrieved successfully',
      );
    } catch (error) {
      console.error('Error building time voucher batch preview:', error);

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        this.getErrorMessage(
          error,
          'Failed to build time voucher batch preview',
        ),
      );
    }
  }

  @Get('admin/v2/:location/teacher-document-signature-requests/:id/preview')
  @Roles(RolesEnum.BACKEND_USER)
  async getTeacherSignatureRequestAdminPreview(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Param('id') requestId: string,
    @Query(ValidationPipe)
    query: TeacherDocumentSignatureRequestPreviewQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
      const preview = await this.service.getAdminRequestPreview(
        locationSlug,
        locationId,
        Number(requestId),
        query.summaryOnly,
      );
      const response = this.isStaffMember(currentUser)
        ? this.service.redactAdminPreviewFinancialFields(preview)
        : preview;

      return ResponseHelper.success(
        response,
        'Signature request preview retrieved successfully',
      );
    } catch (error) {
      console.error('Error retrieving teacher signature admin preview:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        this.getErrorMessage(error, 'Failed to retrieve signature preview'),
      );
    }
  }

  @Get('user/v2/:location/sign-pdfs')
  @Roles(RolesEnum.TEACHER)
  async getMySignatureRequests(
    @LocationId() locationId: number,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
      const requests = await this.service.getTeacherRequests(
        locationId,
        currentUser.id,
      );

      return ResponseHelper.success(
        requests,
        'Signature requests retrieved successfully',
      );
    } catch (error) {
      console.error('Error retrieving teacher signature requests:', error);

      return ResponseHelper.errors.INTERNAL_ERROR(
        this.getErrorMessage(error, 'Failed to retrieve signature requests'),
      );
    }
  }

  @Get('user/v2/:location/sign-pdfs/:id/preview')
  @Roles(RolesEnum.TEACHER)
  async getMySignatureRequestPreview(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Param('id') requestId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
      const preview = await this.service.getTeacherRequestPreview(
        locationSlug,
        locationId,
        currentUser.id,
        Number(requestId),
      );

      return ResponseHelper.success(
        preview,
        'Signature request preview retrieved successfully',
      );
    } catch (error) {
      console.error('Error retrieving teacher signature preview:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        this.getErrorMessage(error, 'Failed to retrieve signature preview'),
      );
    }
  }

  @Patch('user/v2/:location/sign-pdfs/:id/temp-sign')
  @Roles(RolesEnum.TEACHER)
  async tempSignMyRequest(
    @LocationId() locationId: number,
    @Param('id') requestId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
      const result = await this.service.tempSignTeacherRequest(
        locationId,
        currentUser.id,
        Number(requestId),
      );

      return ResponseHelper.success(result, 'Document signed successfully');
    } catch (error) {
      console.error('Error temp signing teacher document:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        this.getErrorMessage(error, 'Failed to sign document'),
      );
    }
  }

  @Patch('user/v2/:location/sign-pdfs/:id/sign')
  @Roles(RolesEnum.TEACHER)
  async signMyRequest(
    @LocationId() locationId: number,
    @Param('id') requestId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(ValidationPipe) body: SignTeacherDocumentSignatureRequestDto,
  ) {
    try {
      const result = await this.service.signTeacherRequest(
        locationId,
        currentUser.id,
        Number(requestId),
        body,
      );

      return ResponseHelper.success(result, 'Document signed successfully');
    } catch (error) {
      console.error('Error signing teacher document:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        this.getErrorMessage(error, 'Failed to sign document'),
      );
    }
  }


  // teacher time voucher rejection feature
  // let teacher reject a time voucher
  // save `reason_for_rejection as well
  @Patch('user/v2/:location/sign-pdfs/:id/reject')
  @Roles(RolesEnum.TEACHER)
  async rejectMyRequest(
    @LocationId() locationId: number,
    @Param('id') requestId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(ValidationPipe) body: RejectTeacherDocumentSignatureRequestDto
  ) {
    try {
      const result = await this.service.rejectTeacherRequest(
        locationId,
        currentUser.id,
        Number(requestId),
        body,
      );

      return ResponseHelper.success(result, 'Document rejected successfully');
    } catch (error) {
      console.error('Error rejecting teacher document:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        this.getErrorMessage(error, 'Failed to reject document'),
      );
    }
  }

  private getAdminMessage(
    created: boolean,
    status: TeacherDocumentSignatureRequestStatus,
  ): string {
    if (created) {
      return 'Signature request sent to teacher';
    }

    if (status === TeacherDocumentSignatureRequestStatus.SIGNED) {
      return 'This document is already signed';
    }

    return 'Signature request already sent to teacher';
  }

  private isStaffMember(currentUser: AuthenticatedUser): boolean {
    const roles = currentUser.roles || [];

    return (
      roles.includes(RolesEnum.STAFFMEMBER) &&
      !roles.includes(RolesEnum.ADMINISTRATOR) &&
      !roles.includes(RolesEnum.OWNER)
    );
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }
}
