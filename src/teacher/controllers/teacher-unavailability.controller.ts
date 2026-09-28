import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { TeacherUnavailabilityRequestDto } from '../dto/teacher-unavailability-request.dto';
import { TeacherUnavailabilityService } from '../services/teacher-unavailability.service';

@Controller('admin/v2/:location/teachers')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class TeacherUnavailabilityController {
  constructor(
    private readonly teacherUnavailabilityService: TeacherUnavailabilityService,
  ) {}

  @Get(':id/unavailability')
  @Roles(RolesEnum.BACKEND_USER)
  async getTeacherUnavailability(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id', ParseIntPipe) teacherId: number,
  ) {
    try {
      const unavailability = await this.teacherUnavailabilityService.getTeacherUnavailability(
        teacherId,
        locationId,
        locationSlug,
      );

      return ResponseHelper.success(
        unavailability,
        'Teacher unavailability retrieved successfully',
      );
    } catch (error) {
      console.error('Error in teacher unavailability controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        error.message || 'Failed to retrieve teacher unavailability',
      );
    }
  }

  @Post(':id/unavailability/validate')
  @Roles(RolesEnum.BACKEND_USER)
  async validateTeacherUnavailability(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id', ParseIntPipe) teacherId: number,
    @Body(ValidationPipe) body: TeacherUnavailabilityRequestDto,
    @Query('unavailabilityId') unavailabilityId: string = '',
  ) {
    try {
      let unavailabilityIdNumber: number | undefined;
      if (unavailabilityId) {
        unavailabilityIdNumber = parseInt(unavailabilityId, 10);
        if (isNaN(unavailabilityIdNumber)) {
          return ResponseHelper.errors.BAD_REQUEST('Invalid unavailabilityId parameter');
        }
      }

      const validationResult =
        await this.teacherUnavailabilityService.validateTeacherUnavailability(
          teacherId,
          locationId,
          locationSlug,
          body,
          unavailabilityIdNumber,
        );

      return ResponseHelper.success(
        validationResult,
        'Teacher unavailability validated successfully',
      );
    } catch (error) {
      console.error('Error in validateTeacherUnavailability controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        error.message || 'Failed to validate teacher unavailability',
      );
    }
  }

  @Post(':id/unavailability')
  @Roles(RolesEnum.BACKEND_USER)
  async createTeacherUnavailability(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id', ParseIntPipe) teacherId: number,
    @Body(ValidationPipe) body: TeacherUnavailabilityRequestDto,
    @Req() req: any,
  ) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.errors.UNAUTHORIZED('User ID not found in request');
      }

      const result = await this.teacherUnavailabilityService.createTeacherUnavailability(
        teacherId,
        locationId,
        locationSlug,
        body,
        userId,
      );

      return ResponseHelper.success(
        result,
        'Teacher unavailability created successfully',
      );
    } catch (error) {
      console.error('Error in createTeacherUnavailability controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        error.message || 'Failed to create teacher unavailability',
      );
    }
  }

  @Put(':id/unavailability/:unavailabilityId')
  @Roles(RolesEnum.BACKEND_USER)
  async updateTeacherUnavailability(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id', ParseIntPipe) teacherId: number,
    @Param('unavailabilityId', ParseIntPipe) unavailabilityId: number,
    @Body(ValidationPipe) body: TeacherUnavailabilityRequestDto,
    @Req() req: any,
  ) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.errors.UNAUTHORIZED('User ID not found in request');
      }

      const result = await this.teacherUnavailabilityService.updateTeacherUnavailability(
        unavailabilityId,
        teacherId,
        locationId,
        locationSlug,
        body,
        userId,
      );

      return ResponseHelper.success(
        result,
        'Teacher unavailability updated successfully',
      );
    } catch (error) {
      console.error('Error in updateTeacherUnavailability controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        error.message || 'Failed to update teacher unavailability',
      );
    }
  }

  @Delete(':id/unavailability/:unavailabilityId')
  @Roles(RolesEnum.BACKEND_USER)
  async deleteTeacherUnavailability(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id', ParseIntPipe) teacherId: number,
    @Param('unavailabilityId', ParseIntPipe) unavailabilityId: number,
    @Req() req: any,
  ) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.errors.UNAUTHORIZED('User ID not found in request');
      }

      await this.teacherUnavailabilityService.deleteTeacherUnavailability(
        unavailabilityId,
        teacherId,
        locationId,
        locationSlug,
        userId,
      );

      return ResponseHelper.successMessage('Teacher unavailability deleted successfully');
    } catch (error) {
      console.error('Error in deleteTeacherUnavailability controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        error.message || 'Failed to delete teacher unavailability',
      );
    }
  }
}
