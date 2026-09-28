import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../../auth/services/auth.service';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { ArcadiaExaminationsRolloutGuard } from '../guards/arcadia-examinations-rollout.guard';
import { EducationPortalStudentService } from '../services/education-portal-student.service';

@Controller('user/v2/:location/education/students')
@UseGuards(
  AuthGuard,
  RolesGuard,
  LocationResolveGuard,
  ArcadiaExaminationsRolloutGuard,
)
export class EducationPortalStudentController {
  constructor(private readonly studentService: EducationPortalStudentService) {}

  @Get()
  @Roles(RolesEnum.CUSTOMER)
  async list(
    @LocationId() locationId: number,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const students = await this.studentService.listForCurrentCustomer(
      currentUser.id,
      locationId,
    );

    return ResponseHelper.success(
      students,
      'Education Portal students retrieved successfully',
    );
  }
}
