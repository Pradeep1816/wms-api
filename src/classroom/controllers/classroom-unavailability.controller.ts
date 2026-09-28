import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ClassroomUnavailabilityService } from '../services/classroom-unavailability.service';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesEnum } from 'src/auth/enums/roles.enum';
import { ResponseHelper } from 'src/shared/helpers/response.helper';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { CreateClassroomUnavailabilityDto } from '../dto/create-classroom-unavailability.dto';
import { UpdateClassroomUnavailabilityDto } from '../dto/update-classroom-unavailability.dto';

@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
@Controller('admin/v2/:location/classroom-unavailability')
export class ClassroomUnavailabilityController {
  constructor(
    private readonly unavailabilityService: ClassroomUnavailabilityService,
  ) {}

  @Get(':classroomId')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async getUnavailabilities(
    @Param('classroomId', ParseIntPipe) classroomId: number,
    @LocationId() locationId: number,
  ) {
    try {
      const data = await this.unavailabilityService.getUnavailabilities(
        classroomId,
        locationId,
      );
      return ResponseHelper.success(
        data,
        'Unavailabilities retrieved successfully',
      );
    } catch (error) {
      console.error('Error in getUnavailabilities controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve unavailabilities',
      );
    }
  }

  @Post(':classroomId/create')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async createUnavailability(
    @Param('classroomId', ParseIntPipe) classroomId: number,
    @LocationId() locationId: number,
    @Body(ValidationPipe) dto: CreateClassroomUnavailabilityDto,
  ) {
    try {
      const data = await this.unavailabilityService.createUnavailability(
        classroomId,
        locationId,
        dto,
      );
      return ResponseHelper.success(data, 'Unavailability created successfully');
    } catch (error) {
      console.error('Error in createUnavailability controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (
        error.message?.includes('past dates') ||
        error.message?.includes('before or equal')
      ) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to create unavailability',
      );
    }
  }

  @Put(':classroomId/update')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async updateUnavailability(
    @Param('classroomId', ParseIntPipe) classroomId: number,
    @LocationId() locationId: number,
    @Body(ValidationPipe) dto: UpdateClassroomUnavailabilityDto,
  ) {
    try {
      const data = await this.unavailabilityService.updateUnavailability(
        dto.id,
        classroomId,
        locationId,
        dto,
      );
      return ResponseHelper.success(data, 'Unavailability updated successfully');
    } catch (error) {
      console.error('Error in updateUnavailability controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (
        error.message?.includes('past dates') ||
        error.message?.includes('before or equal')
      ) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to update unavailability',
      );
    }
  }

  @Delete(':classroomId/delete')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async deleteUnavailability(
    @Param('classroomId', ParseIntPipe) classroomId: number,
    @LocationId() locationId: number,
    @Query('id', ParseIntPipe) id: number,
  ) {
    try {
      const data = await this.unavailabilityService.deleteUnavailability(
        id,
        classroomId,
        locationId,
      );
      return ResponseHelper.success(data, 'Unavailability deleted successfully');
    } catch (error) {
      console.error('Error in deleteUnavailability controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to delete unavailability',
      );
    }
  }
}
