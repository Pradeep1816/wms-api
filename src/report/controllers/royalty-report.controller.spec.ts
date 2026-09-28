import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { RoyaltyReportPresentation } from '../services/royalty-report.service';
import { RoyaltyReportController } from './royalty-report.controller';

describe('RoyaltyReportController access', () => {
  it('allows administrators and owners to open the location report', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      RoyaltyReportController.prototype.getRoyalty,
    );

    expect(roles).toEqual([RolesEnum.ADMINISTRATOR, RolesEnum.OWNER]);
  });

  it('allows administrators and owners to print the all-locations report', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      RoyaltyReportController.prototype.getRoyaltyForAllLocations,
    );

    expect(roles).toEqual([RolesEnum.ADMINISTRATOR, RolesEnum.OWNER]);
  });

  it('routes owners to the client-approved Legacy presentation', async () => {
    const royaltyReportService = {
      getRoyalty: vi.fn().mockResolvedValue({ body: {}, meta: {} }),
    };
    const controller = new RoyaltyReportController(
      royaltyReportService as never,
    );

    await controller.getRoyalty(
      'training-location',
      { startDate: '2026-09-01', endDate: '2026-09-18' },
      { user: { roles: [RolesEnum.OWNER] } },
    );

    expect(royaltyReportService.getRoyalty).toHaveBeenCalledWith(
      'training-location',
      '2026-09-01',
      '2026-09-18',
      RoyaltyReportPresentation.STANDARD,
    );
  });

  it('routes administrators to the client-approved New Report presentation', async () => {
    const royaltyReportService = {
      getRoyalty: vi.fn().mockResolvedValue({ body: {}, meta: {} }),
    };
    const controller = new RoyaltyReportController(
      royaltyReportService as never,
    );

    await controller.getRoyalty(
      'training-location',
      { startDate: '2026-09-01', endDate: '2026-09-18' },
      { user: { roles: [RolesEnum.ADMINISTRATOR] } },
    );

    expect(royaltyReportService.getRoyalty).toHaveBeenCalledWith(
      'training-location',
      '2026-09-01',
      '2026-09-18',
      RoyaltyReportPresentation.ENHANCED,
    );
  });
});
