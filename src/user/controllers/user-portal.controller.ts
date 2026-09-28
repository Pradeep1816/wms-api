import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Put,
  NotFoundException,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';

import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import type { AuthenticatedUser } from '../../auth/services/auth.service';
import { LocationGeodataService } from '../../location/services/location-geodata.service';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { UserService } from '../services/user.service';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { CreateUserInfoDto } from '../dto/create-user-info.dto';
import { DeleteUserInfoDto } from '../dto/delete-user-info.dto';
import { UserInfoService } from '../services/user-info.service';

@Controller('user/v2/:location/user')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class UserPortalController {
  constructor(
    private readonly userService: UserService,
    private readonly locationGeodataService: LocationGeodataService,
    private readonly userInfoService: UserInfoService,
  ) {}

  @Get()
  @Roles(RolesEnum.CUSTOMER, RolesEnum.TEACHER)
  async getUser(
    @Param('location') location: string,
    @LocationId() locationId: number,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
      const portalUserId = await this.resolvePortalUserId(
        currentUser.id,
        locationId,
      );

      if (!portalUserId) {
        return ResponseHelper.error(
          'NOT_FOUND',
          `User with ID ${currentUser.id} not found in location ${location}`,
        );
      }

      const userData = await this.userService.findOne(portalUserId);
      const portalRole = userData.role as RolesEnum;

      if (
        portalRole === RolesEnum.TEACHER ||
        portalRole === RolesEnum.CUSTOMER
      ) {
        userData.userLocations = await this.userService.getPortalUserLocations(
          portalUserId,
          locationId,
          portalRole,
        );
      }

      return ResponseHelper.success(userData, 'User retrieved successfully');
    } catch (error) {
      console.error('Error in user portal getUser controller:', error);
      if (
        error instanceof NotFoundException ||
        (error instanceof Error && error.message.includes('not found'))
      ) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve user data',
      );
    }
  }

  @Get('info')
  @Roles(RolesEnum.TEACHER, RolesEnum.CUSTOMER)
  async getMyProfile(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
      const portalUserId = await this.resolvePortalUserId(
        currentUser.id,
        locationId,
      );

      if (!portalUserId) {
        return ResponseHelper.error(
          'NOT_FOUND',
          `User with ID ${currentUser.id} not found in location ${locationSlug}`,
        );
      }

      const userData = await this.userService.findOne(portalUserId);
      const role = this.resolveFrontendRole(userData.role as RolesEnum);
      const result = await this.userInfoService.getUserInfo(
        locationSlug,
        portalUserId,
        role,
      );

      return ResponseHelper.success(
        result,
        'User profile retrieved successfully',
      );
    } catch (error) {
      if (error instanceof ForbiddenException) {
        return ResponseHelper.errors.FORBIDDEN(
          error.message || 'Access forbidden',
        );
      }

      if (
        error instanceof NotFoundException ||
        (error instanceof Error && error.message.includes('not found'))
      ) {
        return ResponseHelper.error(
          'NOT_FOUND',
          error.message || 'User not found',
        );
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Failed to retrieve user profile';

      return ResponseHelper.errors.INTERNAL_ERROR(message);
    }
  }

  @Get('locations-geodata')
  @Roles(RolesEnum.TEACHER, RolesEnum.CUSTOMER)
  async getLocationGeodata(@Query('type') type?: string) {
    try {
      const data = await this.locationGeodataService.getGeodataByType(type);
      return ResponseHelper.success(
        data,
        'Location geodata retrieved successfully',
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to retrieve location geodata';
      return ResponseHelper.errors.INTERNAL_ERROR(message);
    }
  }

  @Put('info')
  @Roles(RolesEnum.TEACHER, RolesEnum.CUSTOMER)
  async updateMyProfile(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    updateDto: CreateUserInfoDto,
  ) {
    try {
      const portalUserId = await this.resolvePortalUserId(
        currentUser.id,
        locationId,
      );

      if (!portalUserId) {
        return ResponseHelper.error(
          'NOT_FOUND',
          `User with ID ${currentUser.id} not found in location ${locationSlug}`,
        );
      }

      const userData = await this.userService.findOne(portalUserId);
      const role = this.resolveFrontendRole(userData.role as RolesEnum);

      return ResponseHelper.success(
        await this.userInfoService.updateUserInfo(
          locationSlug,
          locationId,
          portalUserId,
          role,
          updateDto,
          currentUser.id,
        ),
        'User profile updated successfully',
      );
    } catch (error) {
      if (error instanceof ForbiddenException) {
        return ResponseHelper.errors.FORBIDDEN(
          error.message || 'Access forbidden',
        );
      }

      if (
        error instanceof NotFoundException ||
        (error instanceof Error && error.message.includes('not found'))
      ) {
        return ResponseHelper.error(
          'NOT_FOUND',
          error.message || 'User not found',
        );
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Failed to update user profile';

      return ResponseHelper.errors.INTERNAL_ERROR(message);
    }
  }

  @Post('info')
  @Roles(RolesEnum.TEACHER, RolesEnum.CUSTOMER)
  async createMyProfileInfo(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    createDto: CreateUserInfoDto,
  ) {
    try {
      const portalUserId = await this.resolvePortalUserId(
        currentUser.id,
        locationId,
      );

      if (!portalUserId) {
        return ResponseHelper.error(
          'NOT_FOUND',
          `User with ID ${currentUser.id} not found in location ${locationSlug}`,
        );
      }

      const userData = await this.userService.findOne(portalUserId);
      const role = this.resolveFrontendRole(userData.role as RolesEnum);

      return ResponseHelper.success(
        await this.userInfoService.createUserInfo(
          locationSlug,
          locationId,
          portalUserId,
          role,
          createDto,
          currentUser.id,
        ),
        'profile created successfully',
      );
    } catch (error) {
      if (error instanceof ForbiddenException) {
        return ResponseHelper.errors.FORBIDDEN(
          error.message || 'Access forbidden',
        );
      }

      if (
        error instanceof NotFoundException ||
        (error instanceof Error && error.message.includes('not found'))
      ) {
        return ResponseHelper.error(
          'NOT_FOUND',
          error.message || 'User not found',
        );
      }

      const message =
        error instanceof Error ? error.message : 'Failed to create profile';

      return ResponseHelper.errors.INTERNAL_ERROR(message);
    }
  }

  @Delete('info')
  @Roles(RolesEnum.TEACHER, RolesEnum.CUSTOMER)
  async deleteMyProfileInfo(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    deleteDto: DeleteUserInfoDto,
  ) {
    try {
      const portalUserId = await this.resolvePortalUserId(
        currentUser.id,
        locationId,
      );

      if (!portalUserId) {
        return ResponseHelper.error(
          'NOT_FOUND',
          `User with ID ${currentUser.id} not found in location ${locationSlug}`,
        );
      }

      const userData = await this.userService.findOne(portalUserId);
      const role = this.resolveFrontendRole(userData.role as RolesEnum);

      return ResponseHelper.success(
        await this.userInfoService.deleteUserInfo(
          locationSlug,
          locationId,
          portalUserId,
          role,
          deleteDto,
          currentUser.id,
        ),
        'User profile deleted successfully',
      );
    } catch (error) {
      if (error instanceof ForbiddenException) {
        return ResponseHelper.errors.FORBIDDEN(
          error.message || 'Access forbidden',
        );
      }

      if (
        error instanceof NotFoundException ||
        (error instanceof Error && error.message.includes('not found'))
      ) {
        return ResponseHelper.error(
          'NOT_FOUND',
          error.message || 'User not found',
        );
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Failed to delete user profile';

      return ResponseHelper.errors.INTERNAL_ERROR(message);
    }
  }

  // Fallback method to determine frontend role based on user's roles
  private resolveFrontendRole(role: RolesEnum): RolesEnum {
    if (role === RolesEnum.TEACHER) {
      return RolesEnum.TEACHER;
    }

    if (role === RolesEnum.CUSTOMER) {
      return RolesEnum.CUSTOMER;
    }

    throw new ForbiddenException('You are not allowed to access user profile');
  }

  private async resolvePortalUserId(
    currentUserId: number,
    locationId: number,
  ): Promise<number | null> {
    return this.userService.resolvePortalUserId(currentUserId, locationId);
  }
}
