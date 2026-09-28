import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { LocationCategoryRoyaltyController } from './location-category-royalty.controller';

describe('Category royalty and advertisement access', () => {
  it.each(['getRates', 'updateRates'] as const)(
    '%s permits only administrators',
    (method) => {
      const guard = new RolesGuard(new Reflector());
      const context = (roles: RolesEnum[]) => ({
        getHandler: () => LocationCategoryRoyaltyController.prototype[method],
        getClass: () => LocationCategoryRoyaltyController,
        switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
      });
      expect(
        guard.canActivate(context([RolesEnum.ADMINISTRATOR]) as never),
      ).toBe(true);
      for (const roles of [[RolesEnum.OWNER], [RolesEnum.STAFFMEMBER], []]) {
        expect(() => guard.canActivate(context(roles) as never)).toThrow(
          ForbiddenException,
        );
      }
    },
  );
});
