import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/services/auth.service';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import {
  CreateDigitalEnrollmentInvitationDto,
  CreateDigitalEnrollmentSubmissionDto,
  DigitalEnrollmentCustomerCandidatesQueryDto,
  DigitalEnrollmentStudentCandidatesQueryDto,
  LinkDigitalEnrollmentCustomerDto,
  LinkDigitalEnrollmentEnrolmentDto,
  LinkDigitalEnrollmentStudentDto,
  SendDigitalEnrollmentInvitationEmailDto,
  SendDigitalEnrollmentEmailDto,
  SetupDigitalEnrollmentKioskDto,
  UpdateDigitalEnrollmentDetailsDto,
  UpdateDigitalEnrollmentPaymentMethodDto,
  UpdateDigitalEnrollmentPaymentAmountsDto,
  UpdateDigitalEnrollmentSubmissionStatusDto,
  VerifyDigitalEnrollmentKioskPinDto,
  VoidDigitalEnrollmentSubmissionDto,
} from '../dto/create-digital-enrollment-submission.dto';
import { DigitalEnrollmentSubmissionService } from '../services/digital-enrollment-submission.service';

@Controller('public/v2/:location/enrollments')
export class DigitalEnrollmentSubmissionController {
  constructor(private readonly submissionService: DigitalEnrollmentSubmissionService) {}

  @Get('package/:token/pdf')
  async findPackagePdf(@Param('location') location: string, @Param('token') token: string) {
    return this.submissionService.findSubmittedPackageByToken(location, token);
  }

  @Get(':token/status')
  async getInvitationStatus(@Param('location') location: string, @Param('token') token: string) {
    return this.submissionService.getInvitationStatus(location, token);
  }

  @Post(':token/verify-pin')
  async verifyKioskPin(
    @Param('location') location: string,
    @Param('token') token: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: VerifyDigitalEnrollmentKioskPinDto,
  ) {
    return this.submissionService.verifyKioskPin(location, token, body.pin);
  }

  @Get(':token/options')
  async getOptions(
    @Param('location') location: string,
    @Param('token') token: string,
    @Query('programId') programId?: string,
  ) {
    const parsedProgramId = programId ? Number(programId) : undefined;
    return this.submissionService.getOptions(
      location,
      token,
      Number.isFinite(parsedProgramId) ? parsedProgramId : undefined,
    );
  }

  @Post(':token/submissions')
  async create(
    @Param('location') location: string,
    @Param('token') token: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: CreateDigitalEnrollmentSubmissionDto,
    @Req() request: Request,
  ) {
    const forwardedFor = request.headers['x-forwarded-for'];
    const ipAddress = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(',')[0]?.trim() || request.ip;

    return this.submissionService.create(location, token, body, {
      ipAddress,
      userAgent: request.headers['user-agent'] ?? null,
    });
  }
}

@Controller('admin/v2/:location/digital-enrollments')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class DigitalEnrollmentAdminController {
  constructor(private readonly submissionService: DigitalEnrollmentSubmissionService) {}

  @Post('invitations')
  @Roles(RolesEnum.BACKEND_USER)
  async createInvitation(
    @Param('location') location: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: CreateDigitalEnrollmentInvitationDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.submissionService.createInvitation(location, body, currentUser.id);
  }

  @Post('invitations/:id/send-email')
  @Roles(RolesEnum.BACKEND_USER)
  async sendInvitationEmail(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: SendDigitalEnrollmentInvitationEmailDto,
  ) {
    return this.submissionService.sendInvitationEmail(locationId, id, body);
  }

  @Post('invitations/:id/void')
  @Roles(RolesEnum.BACKEND_USER)
  async voidInvitation(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.submissionService.voidInvitation(locationId, id, currentUser.id);
  }

  @Post('invitations/:id/resend-email')
  @Roles(RolesEnum.BACKEND_USER)
  async resendInvitationEmail(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.submissionService.resendInvitationEmail(locationId, id);
  }

  @Get()
  @Roles(RolesEnum.BACKEND_USER)
  async findAll(@LocationId() locationId: number, @Query() query: Record<string, string>) {
    return this.submissionService.findAllForLocation(locationId, query);
  }

  @Get('sent-links')
  @Roles(RolesEnum.BACKEND_USER)
  async findSentLinks(@LocationId() locationId: number, @Query() query: Record<string, string>) {
    return this.submissionService.findSentLinksForLocation(locationId, query);
  }

  @Post('kiosk')
  @Roles(RolesEnum.BACKEND_USER)
  async setupKiosk(
    @Param('location') location: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: SetupDigitalEnrollmentKioskDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.submissionService.setupKioskInvitation(location, body.pin, currentUser.id);
  }

  @Get('kiosk')
  @Roles(RolesEnum.BACKEND_USER)
  async getKiosk(@Param('location') location: string) {
    return this.submissionService.getKioskInvitation(location);
  }

  @Get(':id/customer-candidates')
  @Roles(RolesEnum.BACKEND_USER)
  async customerCandidates(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: DigitalEnrollmentCustomerCandidatesQueryDto,
  ) {
    return this.submissionService.getCustomerCandidates(locationId, id, query.search);
  }

  @Get(':id/student-candidates')
  @Roles(RolesEnum.BACKEND_USER)
  async studentCandidates(
    @Param('location') location: string,
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: DigitalEnrollmentStudentCandidatesQueryDto,
  ) {
    return this.submissionService.getStudentCandidates(location, locationId, id, query.customerId);
  }

  @Get(':id')
  @Roles(RolesEnum.BACKEND_USER)
  async findOne(@LocationId() locationId: number, @Param('id', ParseIntPipe) id: number) {
    return this.submissionService.findOneForLocation(locationId, id);
  }

  @Patch(':id/status')
  @Roles(RolesEnum.BACKEND_USER)
  async updateStatus(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: UpdateDigitalEnrollmentSubmissionStatusDto,
  ) {
    return this.submissionService.updateStatus(locationId, id, body.status, body.completionNote);
  }

  @Patch(':id/payment-method')
  @Roles(RolesEnum.BACKEND_USER)
  async updatePaymentMethod(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: UpdateDigitalEnrollmentPaymentMethodDto,
  ) {
    return this.submissionService.updatePaymentMethod(locationId, id, body.paymentMethod);
  }

  @Patch(':id/payment-amounts')
  @Roles(RolesEnum.BACKEND_USER)
  async updatePaymentAmounts(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: UpdateDigitalEnrollmentPaymentAmountsDto,
  ) {
    return this.submissionService.updatePaymentAmounts(locationId, id, body);
  }

  @Patch(':id/details')
  @Roles(RolesEnum.BACKEND_USER)
  async updateDetails(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: UpdateDigitalEnrollmentDetailsDto,
  ) {
    return this.submissionService.updateSubmissionDetails(locationId, id, body);
  }

  @Post(':id/void')
  @Roles(RolesEnum.BACKEND_USER)
  async voidSubmission(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: VoidDigitalEnrollmentSubmissionDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.submissionService.voidSubmission(locationId, id, body.reason, currentUser.id);
  }

  @Post(':id/restore')
  @Roles(RolesEnum.BACKEND_USER)
  async restoreSubmission(@LocationId() locationId: number, @Param('id', ParseIntPipe) id: number) {
    return this.submissionService.restoreSubmission(locationId, id);
  }

  @Post(':id/link-customer')
  @Roles(RolesEnum.BACKEND_USER)
  async linkCustomer(
    @Param('location') location: string,
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: LinkDigitalEnrollmentCustomerDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.submissionService.linkOrCreateCustomer(
      location,
      locationId,
      id,
      body,
      currentUser.id,
    );
  }

  @Delete(':id/link-customer')
  @Roles(RolesEnum.BACKEND_USER)
  async unlinkCustomer(@LocationId() locationId: number, @Param('id', ParseIntPipe) id: number) {
    return this.submissionService.unlinkCustomer(locationId, id);
  }

  @Post(':id/link-student')
  @Roles(RolesEnum.BACKEND_USER)
  async linkStudent(
    @Param('location') location: string,
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: LinkDigitalEnrollmentStudentDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.submissionService.linkOrCreateStudent(location, locationId, id, body, currentUser.id);
  }

  @Delete(':id/link-student')
  @Roles(RolesEnum.BACKEND_USER)
  async unlinkStudent(@LocationId() locationId: number, @Param('id', ParseIntPipe) id: number) {
    return this.submissionService.unlinkStudent(locationId, id);
  }

  @Post(':id/enrollment')
  @Roles(RolesEnum.BACKEND_USER)
  async createEnrollment(
    @Param('location') location: string,
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.submissionService.createEnrollment(location, locationId, id, currentUser.id);
  }

  @Post(':id/link-enrollment')
  @Roles(RolesEnum.BACKEND_USER)
  async linkEnrollment(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: LinkDigitalEnrollmentEnrolmentDto,
  ) {
    return this.submissionService.linkEnrollment(locationId, id, body);
  }

  @Post(':id/additional-students/:index/student')
  @Roles(RolesEnum.BACKEND_USER)
  async createAdditionalStudent(
    @Param('location') location: string,
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('index', ParseIntPipe) index: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: LinkDigitalEnrollmentStudentDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.submissionService.createAdditionalStudent(
      location,
      locationId,
      id,
      index,
      currentUser.id,
      body.studentId,
    );
  }

  @Delete(':id/additional-students/:index/student')
  @Roles(RolesEnum.BACKEND_USER)
  async unlinkAdditionalStudent(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('index', ParseIntPipe) index: number,
  ) {
    return this.submissionService.unlinkAdditionalStudent(locationId, id, index);
  }

  @Post(':id/additional-students/:index/link-enrollment')
  @Roles(RolesEnum.BACKEND_USER)
  async linkAdditionalStudentEnrollment(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('index', ParseIntPipe) index: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: LinkDigitalEnrollmentEnrolmentDto,
  ) {
    return this.submissionService.linkAdditionalStudentEnrolment(locationId, id, index, body.enrolmentId);
  }

  @Post(':id/send-email')
  @Roles(RolesEnum.BACKEND_USER)
  async sendEmail(
    @Param('location') location: string,
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: SendDigitalEnrollmentEmailDto,
  ) {
    return this.submissionService.sendSubmissionEmail(location, locationId, id, body);
  }
}
