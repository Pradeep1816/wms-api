import {
  Controller,
  Get,
  NotFoundException,
  BadRequestException,
  Param,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { type AuthenticatedUser } from '../../auth/services/auth.service';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { TeacherInvoicedLessonsService } from '../services/teacher-invoiced-lessons.service';
import { TeacherUnscheduledLessonsService } from '../services/teacher-unscheduled-lessons.service';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { TeacherInvoicedLessonsRequestDto } from '../dto/teacher-invoiced-lessons-request.dto';
import { TeacherUnscheduledLessonsRequestDto } from '../dto/teacher-unscheduled-lessons-request.dto';
import { LocationId } from 'src/shared/decorators/location-id.decorator';

@Controller('admin/v2/:location/teachers')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class TeacherLessonController {
  constructor(
    private readonly teacherInvoicedLessonsService: TeacherInvoicedLessonsService,
    private readonly teacherUnscheduledLessonsService: TeacherUnscheduledLessonsService,
  ) {}

  @Get(':id/invoiced-lessons')
  @Roles(RolesEnum.BACKEND_USER)
  async getTeacherInvoicedLessons(
    @Param('location') locationSlug: string,
    @Param('id') id: number,
    @Query(ValidationPipe) query: TeacherInvoicedLessonsRequestDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
      const invoicedLessons =
        await this.teacherInvoicedLessonsService.getTeacherInvoicedLessons(
          locationSlug,
          id,
          query.startDate,
          query.endDate,
          query.summaryOnly,
        );

      const response = this.isStaffMember(currentUser)
        ? this.teacherInvoicedLessonsService.redactFinancialFields(
            invoicedLessons,
          )
        : invoicedLessons;

      return ResponseHelper.success(
        response,
        'Teacher invoiced lessons retrieved successfully',
      );
    } catch (error) {
      console.error('Error in teacher invoiced lessons controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        error instanceof Error && error.message
          ? error.message
          : 'Failed to retrieve teacher invoiced lessons',
      );
    }
  }

  @Get(':id/unscheduled-lessons')
  @Roles(RolesEnum.BACKEND_USER)
  async getTeacherUnscheduledLessons(
    @LocationId() locationId: number,
    @Param('id') id: number,
    @Query(ValidationPipe) query: TeacherUnscheduledLessonsRequestDto,
  ) {
    try {
      const unscheduledLessons =
        await this.teacherUnscheduledLessonsService.getTeacherUnscheduledLessons(
          locationId,
          id,
          query,
        );

      return ResponseHelper.success(
        unscheduledLessons,
        'Teacher unscheduled lessons retrieved successfully',
      );
    } catch (error) {
      console.error('Error in teacher unscheduled lessons controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        error instanceof Error && error.message
          ? error.message
          : 'Failed to retrieve teacher unscheduled lessons',
      );
    }
  }

  private isStaffMember(currentUser: AuthenticatedUser): boolean {
    const roles = currentUser.roles || [];

    return (
      roles.includes(RolesEnum.STAFFMEMBER) &&
      !roles.includes(RolesEnum.ADMINISTRATOR) &&
      !roles.includes(RolesEnum.OWNER)
    );
  }
}
