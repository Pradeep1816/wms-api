import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { ArcadiaExaminationsRolloutGuard } from '../guards/arcadia-examinations-rollout.guard';
import { EducationPortalStudentService } from '../services/education-portal-student.service';
import { EducationPortalStudentController } from './education-portal-student.controller';

describe('EducationPortalStudentController', () => {
  it('enforces authentication, role, location resolution, and rollout guards', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      EducationPortalStudentController,
    ) as object[] | undefined;

    expect(guards).toEqual([
      AuthGuard,
      RolesGuard,
      LocationResolveGuard,
      ArcadiaExaminationsRolloutGuard,
    ]);
  });

  it('allows only the customer role to list portal students', () => {
    const listHandler = Object.getOwnPropertyDescriptor(
      EducationPortalStudentController.prototype,
      'list',
    )?.value as object;
    const roles = Reflect.getMetadata(ROLES_KEY, listHandler) as
      | RolesEnum[]
      | undefined;

    expect(roles).toEqual([RolesEnum.CUSTOMER]);
  });

  it('returns the standard SMW response envelope', async () => {
    const students = [
      {
        studentNumber: null,
        displayName: 'Test Student',
        homeLocation: {
          slug: 'training-location',
          name: 'Training Location',
        },
        registrationEligible: null,
      },
    ];
    const service = {
      listForCurrentCustomer: vi.fn().mockResolvedValue(students),
    };
    const controller = new EducationPortalStudentController(
      service as unknown as EducationPortalStudentService,
    );

    await expect(
      controller.list(1, {
        id: 9001,
        username: 'test-customer',
        access_token: 'not-a-real-token',
        roles: [RolesEnum.CUSTOMER],
      }),
    ).resolves.toEqual({
      success: true,
      data: students,
      message: 'Education Portal students retrieved successfully',
    });
  });
});
