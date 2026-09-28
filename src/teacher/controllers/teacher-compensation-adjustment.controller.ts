import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Put,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../../auth/services/auth.service';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import {
  TeacherCompensationAdjustmentQueryDto,
  UpsertTeacherCompensationAdjustmentDto,
} from '../dto/teacher-compensation-adjustment.dto';
import { TeacherCompensationAdjustmentService } from '../services/teacher-compensation-adjustment.service';

@Controller('admin/v2/:location/teachers/:id/compensation-adjustments')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
@Roles(RolesEnum.BACKEND_USER)
export class TeacherCompensationAdjustmentController {
  constructor(private readonly service: TeacherCompensationAdjustmentService) {}

  @Get('minimum-guarantee')
  async getMinimumGuarantee(
    @LocationId() locationId: number,
    @Param('id') teacherId: string,
    @Query(ValidationPipe) query: TeacherCompensationAdjustmentQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
      const canManageHourlyRate = this.canManageAdjustment(currentUser);
      const result = await this.service.getAdjustment(
        locationId,
        Number(teacherId),
        query,
        { includeHourlyRate: canManageHourlyRate },
      );

      return ResponseHelper.success(
        result,
        'Teacher compensation adjustment retrieved successfully',
      );
    } catch (error) {
      return this.handleError(error, 'Failed to retrieve adjustment');
    }
  }

  @Put('minimum-guarantee')
  async upsertMinimumGuarantee(
    @LocationId() locationId: number,
    @Param('id') teacherId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(ValidationPipe) body: UpsertTeacherCompensationAdjustmentDto,
  ) {
    try {
      const canManageHourlyRate = this.canManageAdjustment(currentUser);

      const result = await this.service.upsertAdjustment(
        locationId,
        Number(teacherId),
        currentUser.id,
        body,
        { canManageHourlyRate },
      );

      return ResponseHelper.success(result, 'Compensation adjustment saved');
    } catch (error) {
      return this.handleError(error, 'Failed to save adjustment');
    }
  }

  @Delete(':adjustmentId')
  async deleteAdjustment(
    @LocationId() locationId: number,
    @Param('id') teacherId: string,
    @Param('adjustmentId') adjustmentId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
      this.assertCanManageAdjustment(currentUser);

      const result = await this.service.deleteAdjustment(
        locationId,
        Number(teacherId),
        Number(adjustmentId),
        currentUser.id,
      );

      return ResponseHelper.success(result, 'Compensation adjustment removed');
    } catch (error) {
      return this.handleError(error, 'Failed to remove adjustment');
    }
  }

  private handleError(error: unknown, fallback: string) {
    console.error('Teacher compensation adjustment error:', error);

    if (error instanceof ForbiddenException) {
      return ResponseHelper.errors.FORBIDDEN(error.message);
    }

    if (error instanceof NotFoundException) {
      return ResponseHelper.errors.NOT_FOUND(error.message);
    }

    if (error instanceof BadRequestException) {
      return ResponseHelper.errors.BAD_REQUEST(error.message);
    }

    return ResponseHelper.errors.INTERNAL_ERROR(
      error instanceof Error ? error.message : fallback,
    );
  }

  private assertCanManageAdjustment(currentUser: AuthenticatedUser): void {
    if (this.canManageAdjustment(currentUser)) {
      return;
    }

    throw new ForbiddenException(
      'Only owners and administrators can manage compensation adjustments',
    );
  }

  private canManageAdjustment(currentUser: AuthenticatedUser): boolean {
    const roles = currentUser.roles || [];

    return (
      roles.includes(RolesEnum.ADMINISTRATOR) || roles.includes(RolesEnum.OWNER)
    );
  }
}
