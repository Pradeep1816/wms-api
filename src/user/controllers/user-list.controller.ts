import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { UserService } from '../services/user.service';
import { UserListRequestDto } from '../dto/user-list-request.dto';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { UserRoleValidationPipe } from '../dto/user-role.dto';

@Controller('admin/v2/:location/user')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class UserListController {
  constructor(private readonly userService: UserService) {}


  // this may be removed in the future
  @Get('list')
  @Roles(RolesEnum.BACKEND_USER)
  async getUserList(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: UserListRequestDto,
  ) {
    try {
      const data = await this.userService.findUsersByLocationAndRole(locationId,query);
      
      return ResponseHelper.success(data, `${query.role} users retrieved successfully`);
    } catch (error) {
      console.error('Error in getUserList controller:', error);
      if (error.message && error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', error.message || 'Failed to retrieve user list');
    }
  }

  @Get('list/administrator')
  @Roles(RolesEnum.ADMINISTRATOR)
  async getAdministratorUserList(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: UserListRequestDto,
  ) {
    try { 
      const queryWithRole = { ...query, role: RolesEnum.ADMINISTRATOR };
      const data = await this.userService.findUsersByLocationAndRole(locationId,queryWithRole);
      
      return ResponseHelper.success(data, 'Users retrieved successfully');
    } catch (error) {
      console.error('Error in getUserList controller:', error);
      if (error.message && error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', error.message || 'Failed to retrieve user list');
    }
  }

  @Get('list/owner')
  @Roles(RolesEnum.ADMINISTRATOR)
  async getOwnerUserList(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: UserListRequestDto,
  ) {
    try {
      const queryWithRole = { ...query, role: RolesEnum.OWNER };
      const data = await this.userService.findUsersByLocationAndRole(locationId,queryWithRole);
      
      return ResponseHelper.success(data, 'Users retrieved successfully');
    } catch (error) {
      console.error('Error in getUserList controller:', error);
      if (error.message && error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', error.message || 'Failed to retrieve user list');
    }
  }

  @Get('list/staffmember')
  @Roles(RolesEnum.ADMINISTRATOR,RolesEnum.OWNER)
  async getStaffmemberUserList(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: UserListRequestDto,
  ) {
    try {
      const queryWithRole = { ...query, role: RolesEnum.STAFFMEMBER };
      const data = await this.userService.findUsersByLocationAndRole(locationId,queryWithRole);
      
      return ResponseHelper.success(data, 'Users retrieved successfully');
    } catch (error) {
      console.error('Error in getUserList controller:', error);
      if (error.message && error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', error.message || 'Failed to retrieve user list');
    }
  }

  @Get('list/:role')
  @Roles(RolesEnum.BACKEND_USER)
  async getUserListByRole(
    @LocationId() locationId: number,
    @Param('role',UserRoleValidationPipe) role: RolesEnum, 
    @Query(ValidationPipe) query: UserListRequestDto,
  ) {
    try {
      const queryWithRole = { ...query, role };
      const data = await this.userService.findUsersByLocationAndRole(locationId,queryWithRole);
      
      return ResponseHelper.success(data, `${role} retrieved successfully`);
    } catch (error) {
      console.error('Error in getUserList controller:', error);
      if (error.message && error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', error.message || 'Failed to retrieve user list');
    }
  }
}

