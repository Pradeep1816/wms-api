import { Controller, Delete, Get, Post, Put, Param, Body, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { ApiResponse } from '../../shared/interceptors/response.interceptor';
import { UserInfoService } from '../services/user-info.service';
import { UserInfoDataDto } from '../dto/user-info-response.dto';
import { UserRoleValidationPipe } from '../dto/user-role.dto';
import { CreateUserInfoDto } from '../dto/create-user-info.dto';
import { DeleteUserInfoDto } from '../dto/delete-user-info.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/services/auth.service';


@Controller('admin/v2/:location/user')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class UserInfoController {
  constructor(private readonly userInfoService: UserInfoService) {}

  @Get(':id/info/administrator')
  @Roles(RolesEnum.ADMINISTRATOR)
  async getUserInfoAdministrator(
    @Param('location') locationSlug: string,
    @Param('id') userId: number,
  ): Promise<ApiResponse<UserInfoDataDto> | any> {
    try {
      const role = RolesEnum.ADMINISTRATOR;
      const result = await this.userInfoService.getUserInfo(locationSlug, userId, role);
      return ResponseHelper.success(result, 'User info retrieved successfully');
    } catch (error) {
      console.error('Error in getUserInfo controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve user info');
    }
  }

  @Get(':id/info/owner')
  @Roles(RolesEnum.ADMINISTRATOR) // change to RolesEnum.OWNER if required
  async getAdminInfo(
    @Param('location') locationSlug: string,
    @Param('id') userId: number,
  ): Promise<ApiResponse<UserInfoDataDto> | any> {
    try {
      const role = RolesEnum.OWNER;
      const result = await this.userInfoService.getUserInfo(locationSlug, userId, role);
      return ResponseHelper.success(result, 'User info retrieved successfully');
    } catch (error) {
      console.error('Error in getUserInfo controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve user info');
    }
  }

  @Get(':id/info/staffmember')
  @Roles(RolesEnum.OWNER, RolesEnum.ADMINISTRATOR)
  async getOwnerOrAdminInfo(
    @Param('location') locationSlug: string,
    @Param('id') userId: number,
  ): Promise<ApiResponse<UserInfoDataDto> | any> {
    try {
      const role = RolesEnum.STAFFMEMBER;
      const result = await this.userInfoService.getUserInfo(locationSlug, userId, role);
      return ResponseHelper.success(result, 'User info retrieved successfully');
    } catch (error) {
      console.error('Error in getUserInfo controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve user info');
    }
  }


  @Get(':id/info/:role')
  @Roles(RolesEnum.BACKEND_USER)
  async getUserInfoByRole(
    @Param('location') locationSlug: string,
    @Param('id') userId: number,
    @Param('role',UserRoleValidationPipe) role: RolesEnum,
  ): Promise<ApiResponse<UserInfoDataDto> | any> {
    try {
      const result = await this.userInfoService.getUserInfo(locationSlug, userId, role);
      return ResponseHelper.success(result, 'User info retrieved successfully');
    } catch (error) {
      console.error('Error in getUserInfo controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve user info');
    }
  }
  // Create user info based on role type
  @Post(':id/info/:role')
  @Roles(RolesEnum.BACKEND_USER)
  async createUserInfo(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') userId: number,
    @Param('role', UserRoleValidationPipe) role: RolesEnum,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(ValidationPipe) createDto: CreateUserInfoDto,
  ): Promise<ApiResponse<any> | any> {
    try {
      const result = await this.userInfoService.createUserInfo(
        locationSlug,
        locationId,
        userId,
        role,
        createDto,
        currentUser.id,
      );
      return ResponseHelper.success(result, `${role} ${createDto.type} created successfully`);
    } catch (error) {
      console.error('Error in createUserInfo controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('validation') || error.message.includes('Invalid')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to create user info');
    }
  }

  // Update user info based on role type
  @Put(':id/info/:role')
  @Roles(RolesEnum.BACKEND_USER)
  async updateUserInfo(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') userId: number,
    @Param('role', UserRoleValidationPipe) role: RolesEnum,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(ValidationPipe) updateDto: CreateUserInfoDto,
  ): Promise<ApiResponse<any> | any> {
    try {
      const result = await this.userInfoService.updateUserInfo(
        locationSlug,
        locationId,
        userId,
        role,
        updateDto,
        currentUser.id,
      );
      return ResponseHelper.success(result, `${role} ${updateDto.type} updated successfully`);
    } catch (error) {
      console.error('Error in updateUserInfo controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('validation') || error.message.includes('Invalid')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to update user info');
    }
  }

  @Put(':id/status/:role')
  @Roles(RolesEnum.BACKEND_USER)
  async updateUserStatus(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') userId: number,
    @Param('role', UserRoleValidationPipe) role: RolesEnum,
    @Body(ValidationPipe) updateStatusDto: UpdateUserStatusDto,
  ): Promise<ApiResponse<any> | any> {
    try {
      const result = await this.userInfoService.updateUserStatus(
        locationSlug,
        locationId,
        userId,
        role,
        updateStatusDto.active,
      );
      return ResponseHelper.success(result, 'User status updated successfully');
    } catch (error) {
      console.error('Error in updateUserStatus controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('validation') || error.message.includes('Invalid')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to update user status');
    }
  }

  // Delete user info based on role type
  @Delete(':id/info/:role')
  @Roles(RolesEnum.BACKEND_USER)
  async deleteUserInfo(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') userId: number,
    @Param('role', UserRoleValidationPipe) role: RolesEnum,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(ValidationPipe) deleteDto: DeleteUserInfoDto,
  ): Promise<ApiResponse<any> | any> {
    try {
      const result = await this.userInfoService.deleteUserInfo(
        locationSlug,
        locationId,
        userId,
        role,
        deleteDto,
        currentUser.id,
      );
      return ResponseHelper.success(result, `${role} ${deleteDto.type} deleted successfully`);
    } catch (error) {
      console.error('Error in deleteUserInfo controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('validation') || error.message.includes('Invalid')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to delete user info');
    }
  }
  
}
