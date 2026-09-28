import { Controller, Post, Param, Body, UseGuards, ValidationPipe, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { ApiResponse } from '../../shared/interceptors/response.interceptor';
import { UserCreateService } from '../services/user-create.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { UserRoleValidationPipe } from '../dto/user-role.dto';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/services/auth.service';

@Controller('admin/v2/:location/user')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class UserCreateController {
  constructor(private readonly userCreateService: UserCreateService) {}

  /**
   * Create a teacher user   
  */
  @Post('create/teacher')
  @Roles(RolesEnum.BACKEND_USER)
  async createTeacher(
    @Param('location') locationSlug: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(ValidationPipe) createDto: CreateUserDto,
  ): Promise<ApiResponse<{ id: number; legacyUrl: string }> | any> {
    try {
      const result = await this.userCreateService.createUser(
        locationSlug,
        RolesEnum.TEACHER,
        createDto,
        currentUser.id,
      );
      return ResponseHelper.success(result, 'Teacher user created successfully');
    } catch (error) {
      console.error('Error in createTeacher controller:', error);
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      if (error.message && error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to create teacher user');
    }
  }

  /**
   * Create a user by role (generic endpoint)
   * Replicates legacy: POST /admin/training-location/user/create?role_name={role}
   */
  @Post('create/:role')
  @Roles(RolesEnum.BACKEND_USER)
  async createUserByRole(
    @Param('location') locationSlug: string,
    @Param('role', UserRoleValidationPipe) role: RolesEnum,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(ValidationPipe) createDto: CreateUserDto,
  ): Promise<ApiResponse<{ id: number; legacyUrl: string }> | any> {
    try {
      const result = await this.userCreateService.createUser(
        locationSlug,
        role,
        createDto,
        currentUser.id,
      );
      return ResponseHelper.success(result, `${role} user created successfully`);
    } catch (error) {
      console.error('Error in createUserByRole controller:', error);
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      if (error.message && error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', `Failed to create ${role} user`);
    }
  }
}
