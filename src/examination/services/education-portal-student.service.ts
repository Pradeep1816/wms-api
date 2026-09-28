import { Injectable, NotFoundException } from '@nestjs/common';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthService } from '../../auth/services/auth.service';
import { EducationPortalStudentDto } from '../dto/education-portal-student.dto';
import { ExaminationPortalStudentRepository } from '../repositories/examination-portal-student.repository';

@Injectable()
export class EducationPortalStudentService {
  constructor(
    private readonly authService: AuthService,
    private readonly studentRepository: ExaminationPortalStudentRepository,
  ) {}

  async listForCurrentCustomer(
    authenticatedUserId: number,
    locationId: number,
  ): Promise<EducationPortalStudentDto[]> {
    const portalCustomerId = await this.authService.resolvePortalUserId(
      authenticatedUserId,
      locationId,
    );
    const isCustomer = portalCustomerId
      ? await this.authService.hasRole(portalCustomerId, RolesEnum.CUSTOMER)
      : false;

    if (!portalCustomerId || !isCustomer) {
      throw new NotFoundException({
        success: false,
        errorCode: 'CUSTOMER_NOT_FOUND_OR_NOT_ACCESSIBLE',
        message:
          'Customer education access is not available for this location.',
      });
    }

    const students = await this.studentRepository.findForCustomerAtLocation(
      portalCustomerId,
      locationId,
    );

    return students.map((student) => ({
      studentNumber: null,
      displayName: `${student.firstName} ${student.lastName}`.trim(),
      homeLocation: {
        slug: student.locationSlug,
        name: student.locationName,
      },
      registrationEligible: null,
    }));
  }
}
