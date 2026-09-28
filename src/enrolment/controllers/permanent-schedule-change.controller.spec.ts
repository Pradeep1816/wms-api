import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { PermanentScheduleChangeService } from '../services/permanent-schedule-change.service';
import { EnrolmentInfoController } from './enrolment-info.controller';
import { PermanentScheduleChangeController } from './permanent-schedule-change.controller';

function createController() {
  const service = {
    getPreview: vi.fn(),
    reschedule: vi.fn(),
    getReview: vi.fn(),
    confirm: vi.fn(),
  };
  return {
    controller: new PermanentScheduleChangeController(
      service as unknown as PermanentScheduleChangeService,
    ),
    service,
  };
}

describe('PermanentScheduleChangeController', () => {
  it('owns the existing PSC route paths and access controls', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, PermanentScheduleChangeController),
    ).toBe('admin/v2/:location/enrolments/:id/permanent-schedule-change');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PermanentScheduleChangeController),
    ).toEqual([AuthGuard, RolesGuard, LocationResolveGuard]);

    const routes = [
      ['getPreview', 'preview', RequestMethod.GET],
      ['reschedule', 'reschedule', RequestMethod.POST],
      ['getReview', 'review', RequestMethod.GET],
      ['confirm', 'confirm', RequestMethod.POST],
    ] as const;
    for (const [methodName, path, requestMethod] of routes) {
      const handler = Object.getOwnPropertyDescriptor(
        PermanentScheduleChangeController.prototype,
        methodName,
      )?.value as object;
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(requestMethod);
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
        RolesEnum.BACKEND_USER,
      ]);
    }
  });

  it('removes PSC actions from the general enrolment info controller', () => {
    expect(
      Object.getOwnPropertyDescriptor(
        EnrolmentInfoController.prototype,
        'getPermanentScheduleChangePreview',
      ),
    ).toBeUndefined();
    expect(
      Object.getOwnPropertyDescriptor(
        EnrolmentInfoController.prototype,
        'reschedule',
      ),
    ).toBeUndefined();
    expect(
      Object.getOwnPropertyDescriptor(
        EnrolmentInfoController.prototype,
        'getPermanentScheduleChangeReview',
      ),
    ).toBeUndefined();
  });

  it('delegates preview, reschedule, review, and confirmation to the PSC service', async () => {
    const { controller, service } = createController();
    service.getPreview.mockResolvedValue({ step: 'preview' });
    service.reschedule.mockResolvedValue({ step: 'reschedule' });
    service.getReview.mockResolvedValue({ step: 'review' });
    service.confirm.mockResolvedValue(10);

    await expect(controller.getPreview(3, 10, {})).resolves.toMatchObject({
      success: true,
      data: { body: { step: 'preview' } },
    });
    await expect(
      controller.reschedule(3, 10, { teacherId: 601 } as never, {
        user: { id: 7001 },
      }),
    ).resolves.toMatchObject({
      success: true,
      data: { body: { step: 'reschedule' } },
    });
    await expect(
      controller.getReview(3, 10, { courseId: 44 }),
    ).resolves.toMatchObject({
      success: true,
      data: { step: 'review' },
    });
    await expect(
      controller.confirm(
        'main',
        3,
        10,
        {
          rescheduleBeginDate: '01-02-2026',
          rescheduleEndDate: '30-06-2026',
        },
        { user: { id: 7001 } },
      ),
    ).resolves.toMatchObject({
      success: true,
      data: { enrolmentId: 10 },
    });

    expect(service.getPreview).toHaveBeenCalledWith(3, 10, {});
    expect(service.reschedule).toHaveBeenCalledWith(
      3,
      10,
      { teacherId: 601 },
      7001,
    );
    expect(service.getReview).toHaveBeenCalledWith(3, 10, { courseId: 44 });
    expect(service.confirm).toHaveBeenCalledWith(
      'main',
      3,
      10,
      {
        rescheduleBeginDate: '01-02-2026',
        rescheduleEndDate: '30-06-2026',
      },
      7001,
    );
  });

  it('rejects rescheduling without an authenticated user', async () => {
    const { controller, service } = createController();

    await expect(
      controller.reschedule(3, 10, {} as never, {}),
    ).resolves.toEqual({
      success: false,
      errorCode: 'UNAUTHORIZED',
      message: 'User not authenticated',
    });
    expect(service.reschedule).not.toHaveBeenCalled();
  });

  it('rejects PSC confirmation without an authenticated user', async () => {
    const { controller, service } = createController();

    await expect(
      controller.confirm(
        'main',
        3,
        10,
        {
          rescheduleBeginDate: '01-02-2026',
          rescheduleEndDate: '30-06-2026',
        },
        {},
      ),
    ).resolves.toEqual({
      success: false,
      errorCode: 'UNAUTHORIZED',
      message: 'User not authenticated',
    });
    expect(service.confirm).not.toHaveBeenCalled();
  });
});
