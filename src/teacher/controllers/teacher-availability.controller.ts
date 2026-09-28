import { Controller, Get, Post, Delete, NotFoundException, Param, Query, Body, UseGuards, ValidationPipe, BadRequestException, Req } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { TeacherAvailabilityService } from '../services/teacher-availability.service';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { ModifyTeacherAvailabilityDto } from '../dto/modify-teacher-availability.dto';

@Controller('admin/v2/:location/teachers')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class TeacherAvailabilityController {
  constructor(
    private readonly teacherAvailabilityService: TeacherAvailabilityService,
  ) {}

  @Get(':id/availability')
  @Roles(RolesEnum.BACKEND_USER)
  async getTeacherAvailability(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') id: number,
    @Query('date') date?: string,
  ) {
    try {
      const availability = await this.teacherAvailabilityService.getTeacherAvailability(
        id,
        locationId,
        locationSlug,
        date,
      );

      return ResponseHelper.success(availability, 'Teacher availability retrieved successfully');
    } catch (error) {
      console.error('Error in teacher availability controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve teacher availability');
    }
  }

  @Post(':id/availability/modify')
  @Roles(RolesEnum.BACKEND_USER)
  async modifyTeacherAvailability(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') teacherId: number,
    @Query('availabilityId') availabilityId: string,
    @Body(ValidationPipe) body: ModifyTeacherAvailabilityDto,
    @Req() req: any,
  ) {
    try {
      const availabilityIdNumber = availabilityId ? parseInt(availabilityId, 10) : 0;
      if (isNaN(availabilityIdNumber)) {
        return ResponseHelper.errors.BAD_REQUEST('Invalid availabilityId parameter');
      }

      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.errors.UNAUTHORIZED('User ID not found in request');
      }

      const result = await this.teacherAvailabilityService.modifyTeacherAvailability(
        availabilityIdNumber,
        teacherId,
        locationId,
        body,
        userId,
      );

      return ResponseHelper.success(result, 'Teacher availability modified successfully');
    } catch (error) {
      console.error('Error in modifyTeacherAvailability controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to modify teacher availability');
    }
  }

  @Delete(':id/availability/:availabilityId')
  @Roles(RolesEnum.BACKEND_USER)
  async deleteTeacherAvailability(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') teacherId: number,
    @Param('availabilityId') availabilityId: number,
    @Req() req: any,
  ) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.errors.UNAUTHORIZED('User ID not found in request');
      }

      await this.teacherAvailabilityService.deleteTeacherAvailability(
        availabilityId,
        userId,
      );

      return ResponseHelper.successMessage('Teacher availability deleted successfully');
    } catch (error) {
      console.error('Error in deleteTeacherAvailability controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to delete teacher availability');
    }
  }
}
