import { Controller, Get, Put, Param, Body, UseGuards, ValidationPipe } from '@nestjs/common';
import { PermissionService } from '../services/permission.service';
import { AuthGuard } from '../guards/auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { RolesEnum } from '../enums/roles.enum';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { AuthenticatedUser } from '../services/auth.service';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { PermissionDto } from '../dto/permission.dto';

@Controller('admin/v2/:location/permissions')
@UseGuards(AuthGuard, RolesGuard)
export class PermissionController {
  constructor(
    private readonly permissionService: PermissionService,
  ) {}

  @Get()
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async getPermissions(@Param('location') location: string) {
    try {
      const data = await this.permissionService.getPermissions(location);

      return ResponseHelper.success(data, 'Permissions retrieved successfully');
    } catch (error) {
      console.error('Error in getPermissions controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve permissions');
    }
  }

  @Put()
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async updatePermission(
    @Param('location') location: string,
    @Body(ValidationPipe) dto: PermissionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    try {
      const result = await this.permissionService.updatePermission(
        location,
        dto.permission,
        dto.enable,
        user?.id,
      );

      if (result) {
        return ResponseHelper.success(
          { permission: dto.permission, enable: dto.enable },
          `Permission '${dto.permission}' ${dto.enable ? 'enabled' : 'disabled'} successfully`,
        );
      } else {
        return ResponseHelper.error(
          'INTERNAL_SERVER_ERROR',
          `Failed to ${dto.enable ? 'enable' : 'disable'} permission`,
        );
      }
    } catch (error) {
      console.error('Error in updatePermission controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        `Failed to update permission`,
      );
    }
  }
}
