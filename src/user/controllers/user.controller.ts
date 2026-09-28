import { Controller, Get, Post, Param, Query, Body, UseGuards, ValidationPipe, BadRequestException, ParseIntPipe } from '@nestjs/common';
import { UserService } from '../services/user.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import type { AuthenticatedUser } from '../../auth/services/auth.service';
import { PermissionService } from '../../auth/services/permission.service';
import { LocationService } from '../../location/services/location.service';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { SetPasswordDto } from '../dto/set-password.dto';
@Controller('admin/v2/:location/user')
@UseGuards(AuthGuard, RolesGuard,LocationResolveGuard)
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly permissionService: PermissionService,
    private readonly locationService: LocationService,
  ) {}

  @Get()
  @Roles(RolesEnum.BACKEND_USER)
  async getUser(
    @Param('location') location: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
      const userData = await this.userService.findOne(currentUser.id);
      
      // Get location ID from slug
      const locationId = await this.locationService.getLocationId(location);
      
      // Get user locations based on business logic
      const userLocations = await this.userService.getUserLocations(currentUser.id, locationId);
      
      // Add userLocations to response if user has staffmember or owner role
      if (userData.role === 'staffmember' || userData.role === 'owner') {
        userData.userLocations = userLocations;
      }

      return ResponseHelper.success(userData, 'User retrieved successfully');
    } catch (error) {
      console.error('Error in getUser controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve user data');
    }
  }

  @Get('permissions')
  @Roles(RolesEnum.BACKEND_USER)
  async getUserPermissions(
    @Param('location') location: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
      // Get location ID from slug
      const locationId = await this.locationService.getLocationId(location);
      
      // Get user permissions for this location
      const [userPermissions, dashboardPermissions] = await Promise.all([
        this.permissionService.getUserPermissions(currentUser.id, locationId),
        this.permissionService.getDashboardPermissions(currentUser.id, locationId),
      ]);

      const permissionsData = {
        locationId,
        permissions: userPermissions,
        dashboardPermissions,
      };

      return ResponseHelper.success(permissionsData, 'User permissions retrieved successfully');
    } catch (error) {
      console.error('Error in getUserPermissions controller:', error);
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve user permissions');
    }
  }

  @Get('validate-email')
  @Roles(RolesEnum.BACKEND_USER)
  async validateEmail(
    @Param('location') location: string,
    @Query('email') email: string,
    @Query('role') role?: string,
  ) {
    try {
      if (!email) {
        return ResponseHelper.error('BAD_REQUEST', 'Email parameter is required');
      }

      // Get location ID from slug
      const locationId = await this.locationService.getLocationId(location);
      
      // Check if email already exists in this location
      // If role is provided, check for that specific role; otherwise check all roles
      const emailExists = await this.userService.checkEmailExists(email, locationId, role);

      return ResponseHelper.success(
        { email, exists: emailExists, locationId, role: role || 'all' },
        emailExists ? 'Email already exists' : 'Email is available'
      );
    } catch (error) {
      console.error('Error in validateEmail controller:', error);
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to validate email');
    }
  }

  /**
   * Set password and/or PIN for a user
   * Replicates legacy: POST /admin/{location}/user/set-password?id={userId}
   * New endpoint: POST /admin/v2/{location}/user/{id}/set-password
   */
  @Post(':id/set-password')
  @Roles(RolesEnum.BACKEND_USER)
  async setPassword(
    @Param('location') location: string,
    @Param('id', ParseIntPipe) userId: number,
    @Body(ValidationPipe) setPasswordDto: SetPasswordDto,
  ) {
    try {
      const mergeFlag = setPasswordDto.merge;

      // Validate that at least one supported field is provided
      if (
        !setPasswordDto.password &&
        setPasswordDto.pin === undefined &&
        setPasswordDto.canLogin === undefined &&
        mergeFlag === undefined
      ) {
        return ResponseHelper.error(
          'BAD_REQUEST',
          'At least one of password, PIN, canLogin, or merge must be provided',
        );
      }

      // Validate password match if password is provided
      if (setPasswordDto.password && setPasswordDto.confirmPassword) {
        if (setPasswordDto.password !== setPasswordDto.confirmPassword) {
          return ResponseHelper.error('BAD_REQUEST', "Confirm Password doesn't match with the password");
        }
      }

      // If password is provided but confirmPassword is missing, return error
      if (setPasswordDto.password && !setPasswordDto.confirmPassword) {
        return ResponseHelper.error('BAD_REQUEST', 'Confirm password is required when setting password');
      }

      // Set password/pin
      await this.userService.setPassword(userId, setPasswordDto);

      // Return success response matching legacy format
      return ResponseHelper.success({ status: true }, 'Password/PIN updated successfully');
    } catch (error) {
      console.error('Error in setPassword controller:', error);
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      if (error.message && error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to set password');
    }
  }

}
