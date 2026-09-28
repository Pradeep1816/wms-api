import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../../auth/services/auth.service';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import {
  CreateEnrolmentPolicyDto,
  ReorderEnrolmentPoliciesDto,
  UpdateEnrolmentPolicyDto,
} from '../dto/enrolment-policy.dto';
import { EnrolmentPolicyService } from '../services/enrolment-policy.service';

/** Read-only feed for the customer-facing enrolment form (unauthenticated). */
@Controller('public/v2/:location/enrolment-policies')
export class PublicEnrolmentPolicyController {
  constructor(private readonly service: EnrolmentPolicyService) {}

  @Get()
  async getActivePolicies() {
    try {
      const result = await this.service.getActivePolicies();

      return ResponseHelper.success(
        result,
        'Enrolment policies retrieved successfully',
      );
    } catch (error) {
      console.error('Error retrieving enrolment policies:', error);

      return ResponseHelper.errors.INTERNAL_ERROR(
        error instanceof Error
          ? error.message
          : 'Failed to retrieve enrolment policies',
      );
    }
  }
}

@Controller('admin/v2/:location/enrolment-policies')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
@Roles(RolesEnum.BACKEND_USER)
export class EnrolmentPolicyController {
  constructor(private readonly service: EnrolmentPolicyService) {}

  @Get()
  async getPolicies() {
    try {
      const result = await this.service.getPolicies();

      return ResponseHelper.success(
        result,
        'Enrolment policies retrieved successfully',
      );
    } catch (error) {
      return this.handleError(error, 'Failed to retrieve enrolment policies');
    }
  }

  @Post()
  async createPolicy(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: CreateEnrolmentPolicyDto,
  ) {
    try {
      const result = await this.service.createPolicy(currentUser.id, body);

      return ResponseHelper.success(result, 'Enrolment policy created successfully');
    } catch (error) {
      return this.handleError(error, 'Failed to create enrolment policy');
    }
  }

  @Patch('reorder')
  async reorderPolicies(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: ReorderEnrolmentPoliciesDto,
  ) {
    try {
      const result = await this.service.reorderPolicies(currentUser.id, body);

      return ResponseHelper.success(result, 'Enrolment policies reordered successfully');
    } catch (error) {
      return this.handleError(error, 'Failed to reorder enrolment policies');
    }
  }

  @Patch(':id')
  async updatePolicy(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: UpdateEnrolmentPolicyDto,
  ) {
    try {
      const result = await this.service.updatePolicy(id, currentUser.id, body);

      return ResponseHelper.success(result, 'Enrolment policy updated successfully');
    } catch (error) {
      return this.handleError(error, 'Failed to update enrolment policy');
    }
  }

  @Delete(':id')
  async deletePolicy(@Param('id', ParseIntPipe) id: number) {
    try {
      const result = await this.service.deletePolicy(id);

      return ResponseHelper.success(result, 'Enrolment policy deleted successfully');
    } catch (error) {
      return this.handleError(error, 'Failed to delete enrolment policy');
    }
  }

  private handleError(error: unknown, fallbackMessage: string) {
    console.error(`${fallbackMessage}:`, error);

    if (error instanceof NotFoundException) {
      // NOT_FOUND appends " not found" to the resource name it is given.
      return ResponseHelper.errors.NOT_FOUND('Enrolment policy');
    }

    if (error instanceof BadRequestException) {
      return ResponseHelper.errors.BAD_REQUEST(error.message);
    }

    return ResponseHelper.errors.INTERNAL_ERROR(
      error instanceof Error ? error.message : fallbackMessage,
    );
  }
}
