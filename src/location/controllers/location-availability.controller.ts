import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  ParseIntPipe,
  UseGuards,
  ValidationPipe,
  Req,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { LocationAvailabilityService } from '../services/location-availability.service';
import { LocationAvailabilityEditService } from '../services/location-availability-edit.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationRenderEventsRequestDto } from '../dto/location-availability-request.dto';
import { LocationAvailabilityEditDto } from '../dto/location-availability.request.dto';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { LocationAvailability } from '../entities/location-availability.entity';

@Controller('admin/v2/:location')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class LocationAvailabilityController {
  constructor(
    private readonly locationAvailabilityService: LocationAvailabilityService,
    private readonly locationAvailabilityEditService: LocationAvailabilityEditService,
  ) {}

  @Get('render-events')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async getRenderEvents(
    @LocationId() locationId: number,
    @Query(new ValidationPipe({ transform: true })) query: LocationRenderEventsRequestDto,
    @Req() req: any,
  ) {
    try {
      const userId = req.user?.id;

      if(!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not found');
      }

      const events = await this.locationAvailabilityService.getRenderEvents(
        locationId,
        query.type,
        userId,
      );



      return ResponseHelper.success(events, query.type === LocationAvailability.TYPE_OPERATION_TIME ? 'Operation time availability retrieved successfully' : 'Schedule availability retrieved successfully');
    } catch (error) {
      console.error('Error in getRenderEvents controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error.message?.includes('type must be')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve location render events',
      );
    }
  }

  // Copy From Operational Hours: replace Schedule Visibility with a copy of Operational Hours
  @Post('copy-availability')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async copyAvailability(
    @LocationId() locationId: number,
    @Req() req: any,
  ) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not found');
      }

      const result =
        await this.locationAvailabilityService.copyAvailabilityFromOperationalHours(
          locationId,
          userId,
        );

      return ResponseHelper.success(
        {locationId: result.locationId},
        'Successfully copied the operation hours availability',
      );
    } catch (error) {
      console.error('Error in copyAvailability controller:', error);

      if (error instanceof ForbiddenException) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }
      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to copy operational hours to schedule visibility',
      );
    }
  }

  @Post('create')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async addAvailability(
    @LocationId() locationId: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: LocationAvailabilityEditDto,
    @Req() req: any,
  ) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const data = await this.locationAvailabilityEditService.addAvailability(locationId,dto);

      return ResponseHelper.success(
        data,
        'Availability added successfully',
      );
    } catch (error) {
      console.error('Error in addAvailability controller:', error);

      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to add availability',
      );
    }
  }

  @Put('edit-availability')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async editAvailability(
    @LocationId() locationId: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: LocationAvailabilityEditDto,
    @Req() req: any,
  ) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      await this.locationAvailabilityEditService.editAvailability(
        locationId,
        dto.resourceId,
        dto.type,
        dto.startTime,
        dto.endTime,
      );

      return ResponseHelper.successMessage(
        'Availability updated successfully',
      );
    } catch (error) {
      console.error('Error in editAvailability controller:', error);

      if (error instanceof ForbiddenException) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }
      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to update availability',
      );
    }
  }

  @Delete('availability/:id')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async deleteAvailability(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      await this.locationAvailabilityEditService.deleteAvailability(
        locationId,
        id,
      );

      return ResponseHelper.successMessage(
        'Availability deleted successfully',
      );
    } catch (error) {
      console.error('Error in deleteAvailability controller:', error);

      if (error instanceof ForbiddenException) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to delete availability',
      );
    }
  }
}
