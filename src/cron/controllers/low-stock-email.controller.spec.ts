import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { LowStockEmailController } from './low-stock-email.controller';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { RolesEnum } from '../../auth/enums/roles.enum';

describe('low-stock email operator access', () => {
  it.each(['status', 'run'] as const)(
    'restricts %s to administrators',
    (method) => {
      const guard = new RolesGuard(new Reflector());
      const context = (roles: string[]) =>
        ({
          getHandler: () => LowStockEmailController.prototype[method],
          getClass: () => LowStockEmailController,
          switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
        }) as any;
      expect(guard.canActivate(context([RolesEnum.ADMINISTRATOR]))).toBe(true);
      for (const roles of [[RolesEnum.OWNER], [RolesEnum.STAFFMEMBER], []]) {
        expect(() => guard.canActivate(context(roles))).toThrow(
          'Access denied',
        );
      }
    },
  );
});
