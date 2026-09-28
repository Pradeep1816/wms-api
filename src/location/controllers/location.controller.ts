import { Controller, Get, Post, Param, Body, Query, UseGuards, ValidationPipe, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { LocationService } from '../services/location.service';
import { LocationDetailsService } from '../services/location-info.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { UpdateLocationFlagsDto } from '../dto/location-flags.dto';
import type { AuthenticatedUser } from '../../auth/services/auth.service';
import { LocationRequestDto } from '../dto/location-list-request.dto';
import { LocationApiResponseDto } from '../dto/location-list-response.dto';
import { LocationDetailsResponseDto } from '../dto/location-details-response.dto';
import { LocationInfoResponseDto } from '../dto/location-info-response.dto';
import { VerifyFlagsPasswordDto } from '../dto/verify-flags-password.dto';
import * as bcrypt from 'bcryptjs';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';

@Controller('admin/v2')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class LocationController {
  constructor(
    private readonly locationService: LocationService,
    private readonly locationDetailsService: LocationDetailsService,
  ) {}

  private validateAdminAccess(currentUser: AuthenticatedUser): void {
    if (currentUser.id !== 694) {
      throw new ForbiddenException('Access denied. Only admin user 694 can update location flags.');
    }
  }

  @Get('locations')
  @Roles(RolesEnum.BACKEND_USER)
  async getLocations() {
    try {
      const locations = await this.locationService.findAll();

      return ResponseHelper.success(locations, 'Locations retrieved successfully');
    } catch (error) {
      console.error('Error in getLocations controller:', error);
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve locations');
    }
  }


   @Get('user/locations')
  @Roles(RolesEnum.TEACHER, RolesEnum.CUSTOMER)
  async getUserLocations() {
    try {
      const locations = await this.locationService.findAll();

      return ResponseHelper.success(locations, 'Locations retrieved successfully');
    } catch (error) {
      console.error('Error in getLocations controller:', error);
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve locations');
    }
  }

  @Get('locations/flags')
  @Roles(RolesEnum.BACKEND_USER)
  async getAllLocationFlags(
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
      // Allow all backend users (admin, owner, staffmember) to read location flags
      // Only admin users can update flags (enforced in POST endpoint)
      
      const allFlags = await this.locationService.getAllLocationFlags();

      return ResponseHelper.success(allFlags, 'All location flags retrieved successfully');
    } catch (error) {
      console.error('Error in getAllLocationFlags controller:', error);
      if (error instanceof ForbiddenException) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve all location flags');
    }
  }

  @Get('locations/:location/flags')
  @Roles(RolesEnum.BACKEND_USER)
  async getLocationFlags(
    @Param('location') location: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
      // Allow all backend users (admin, owner, staffmember) to read location flags
      // Only admin users can update flags (enforced in POST endpoint)
      
      const flags = await this.locationService.getLocationFlags(location);

      return ResponseHelper.success(flags, 'Location flags retrieved successfully');
    } catch (error) {
      console.error('Error in getLocationFlags controller:', error);
      if (error instanceof ForbiddenException) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve location flags');
    }
  }

  @Post('locations/:location/flags')
  @Roles(RolesEnum.BACKEND_USER)
  async updateLocationFlags(
    @Param('location') location: string,
    @Body(ValidationPipe) updateFlagsDto: UpdateLocationFlagsDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
      this.validateAdminAccess(currentUser);
      
      const flags = await this.locationService.updateLocationFlags(location, updateFlagsDto.flags);

      return ResponseHelper.success(flags, 'Location flags updated successfully');
    } catch (error) {
      console.error('Error in updateLocationFlags controller:', error);
      if (error instanceof ForbiddenException) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('validation')) {
        return ResponseHelper.error('VALIDATION_ERROR', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to update location flags');
    }
  }

  @Post('locations/flags/verify-password')
  @Roles(RolesEnum.BACKEND_USER)
  async verifyFlagsPassword(
    @Body(ValidationPipe) verifyDto: VerifyFlagsPasswordDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
      this.validateAdminAccess(currentUser);

      const isValid = await bcrypt.compare(verifyDto.password, '$2a$12$8MZe9h4qUhnSEHAI5J6.puVUYs.91s8aEF8/050lEzfHBV09Qyx7G');

      if (!isValid) {
        return ResponseHelper.error('UNAUTHORIZED', 'Invalid password');
      }

      return ResponseHelper.success({ valid: true }, 'Password verified successfully');
    } catch (error) {
      console.error('Error in verifyFlagsPassword controller:', error);
      if (error instanceof ForbiddenException) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to verify password');
    }
  }
  @Get('locations/list')
  @Roles(RolesEnum.ADMINISTRATOR)
  async getLocationsList(
    @Query(ValidationPipe) query: LocationRequestDto,
  ): Promise<LocationApiResponseDto | any> {
    try {
      const data = await this.locationService.getLocations(query);
      return ResponseHelper.success(
        data,
        'Locations retrieved successfully',
      );
    } catch (error) {
      console.error('Error fetching Locations:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve Locations',
      );
    }
  }

  @Get('locations/:location/details')
  @Roles(RolesEnum.BACKEND_USER)
  async getLocationDetails(
    @Param('location') location: string,
  ): Promise<LocationDetailsResponseDto | any> {
    try {
      const locationDetails = await this.locationService.getLocationDetailsBySlug(location);
      return ResponseHelper.success(
        locationDetails,
        'Location details retrieved successfully',
      );
    } catch (error) {
      console.error('Error fetching location details:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve location details',
      );
    }
  }

  @Get(':location/info')
  @Roles(RolesEnum.BACKEND_USER)
  async getLocationInfo(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
  ): Promise<LocationInfoResponseDto | any> {
    try {
      const locationDetails = await this.locationDetailsService.getLocationDetails(
        locationId,
        locationSlug,
      );

      return ResponseHelper.success(
        locationDetails,
        'Location details retrieved successfully',
      );
    } catch (error) {
      console.error('Error fetching location details:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve location details',
      );
    }
  }
}




