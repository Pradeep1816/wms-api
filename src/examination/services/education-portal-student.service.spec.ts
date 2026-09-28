import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../auth/services/auth.service';
import { ExaminationPortalStudentRepository } from '../repositories/examination-portal-student.repository';
import { EducationPortalStudentService } from './education-portal-student.service';

describe('EducationPortalStudentService', () => {
  const authService = {
    resolvePortalUserId: vi.fn(),
    hasRole: vi.fn(),
  };
  const studentRepository = {
    findForCustomerAtLocation: vi.fn(),
  };
  let service: EducationPortalStudentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EducationPortalStudentService(
      authService as unknown as AuthService,
      studentRepository as unknown as ExaminationPortalStudentRepository,
    );
  });

  it('returns only the minimal Education Portal student DTO', async () => {
    authService.resolvePortalUserId.mockResolvedValue(15004);
    authService.hasRole.mockResolvedValue(true);
    studentRepository.findForCustomerAtLocation.mockResolvedValue([
      {
        firstName: 'Test',
        lastName: 'Student',
        locationSlug: 'training-location',
        locationName: 'Training Location',
        ignoredPrivateField: 'must not escape',
      },
    ]);

    await expect(service.listForCurrentCustomer(9001, 1)).resolves.toEqual([
      {
        studentNumber: null,
        displayName: 'Test Student',
        homeLocation: {
          slug: 'training-location',
          name: 'Training Location',
        },
        registrationEligible: null,
      },
    ]);
    expect(studentRepository.findForCustomerAtLocation).toHaveBeenCalledWith(
      15004,
      1,
    );
  });

  it('does not infer registration eligibility from existing student status', async () => {
    authService.resolvePortalUserId.mockResolvedValue(15004);
    authService.hasRole.mockResolvedValue(true);
    studentRepository.findForCustomerAtLocation.mockResolvedValue([
      {
        firstName: 'Inactive',
        lastName: 'Student',
        locationSlug: 'training-location',
        locationName: 'Training Location',
      },
    ]);

    const [student] = await service.listForCurrentCustomer(9001, 1);

    expect(student.registrationEligible).toBeNull();
  });

  it('rejects when the authenticated identity has no user at the route location', async () => {
    authService.resolvePortalUserId.mockResolvedValue(null);

    await expect(
      service.listForCurrentCustomer(9001, 99),
    ).rejects.toMatchObject({
      response: {
        success: false,
        errorCode: 'CUSTOMER_NOT_FOUND_OR_NOT_ACCESSIBLE',
      },
    });
    expect(authService.hasRole).not.toHaveBeenCalled();
    expect(studentRepository.findForCustomerAtLocation).not.toHaveBeenCalled();
  });

  it('rejects when the location-specific portal identity is not a customer', async () => {
    authService.resolvePortalUserId.mockResolvedValue(7002);
    authService.hasRole.mockResolvedValue(false);

    await expect(
      service.listForCurrentCustomer(9001, 1),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(studentRepository.findForCustomerAtLocation).not.toHaveBeenCalled();
  });
});
