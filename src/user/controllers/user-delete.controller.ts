import { Controller, Delete, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { UserService } from '../services/user.service';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { UserRoleValidationPipe } from '../dto/user-role.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/services/auth.service';

@Controller('admin/v2/:location/user')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class UserDeleteController {
  constructor(private readonly userService: UserService) {}

  @Delete(':id/:role')
  @Roles(RolesEnum.BACKEND_USER)
  async deleteUserByRole(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') userId: number,
    @Param('role', UserRoleValidationPipe) role: RolesEnum,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
      const deletedUser = await this.userService.deleteUserByRole(
        locationSlug,
        userId,
        locationId,
        role,
        currentUser.id,
      );

      // Build redirect URL back to user list based on role
      const url = this.redirectUrl(locationSlug, role);
      const legacyUrl = `/admin/${locationSlug}/user/index?UserSearch[role_name]=${role}`;

      return ResponseHelper.success(
        { 
          id: deletedUser.id,
          url,
          legacyUrl,
        },
        `${role} deleted successfully`,
      );
    } catch (error) {
      console.error('Error in deleteUserByRole controller:', error);
      if (error.message && error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (
        error.message &&
        (error.message.includes('student') ||
          error.message.includes('payment') ||
          error.message.includes('protected') ||
          error.message.includes('qualifications') ||
          error.message.includes('courses'))
      ) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error.message || `Failed to delete ${role}`,
      );
    }
  }

  /**
   * Build redirect URL to user list based on role
   * @param locationSlug - The location slug
   * @param role - The user role
   * @returns The redirect URL
   */
  private redirectUrl(locationSlug: string, role: RolesEnum): string {
    const baseUrl = `/v2/admin/${locationSlug}`;
    return `${baseUrl}/${role.toLowerCase()}`;
  }
}
