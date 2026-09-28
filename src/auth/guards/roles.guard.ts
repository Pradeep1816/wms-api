import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesEnum } from '../enums/roles.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Expand role groups to individual roles
    const expandedRoles = this.expandRoleGroups(requiredRoles);
    const hasRole = expandedRoles.some((role) => user.roles?.includes(role));
    
    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}`
      );
    }

    return true;
  }

  private expandRoleGroups(roles: string[]): string[] {
    const expandedRoles: string[] = [];
    
    for (const role of roles) {
      if (role === RolesEnum.BACKEND_USER) {
        // BACKEND_USER group includes ADMINISTRATOR, OWNER, and STAFFMEMBER
        expandedRoles.push(
          RolesEnum.ADMINISTRATOR,
          RolesEnum.OWNER,
          RolesEnum.STAFFMEMBER
        );
      } else {
        expandedRoles.push(role);
      }
    }
    
    return expandedRoles;
  }
}
