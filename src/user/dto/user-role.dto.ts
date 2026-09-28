import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { RolesEnum } from '../../auth/enums/roles.enum';

// Get valid individual roles (exclude group roles like BACKEND_USER)
const VALID_ROLES = Object.values(RolesEnum).filter(
  (role) => role !== RolesEnum.BACKEND_USER,
) as RolesEnum[];

// Create a Set for O(1) lookup performance
const VALID_ROLES_SET = new Set(VALID_ROLES);

@Injectable()
export class UserRoleValidationPipe implements PipeTransform<string, RolesEnum> {
  transform(value: string): RolesEnum {
    if (!value?.trim()) {
      throw new BadRequestException('Role parameter is required');
    }

    const trimmedValue = value.trim();
    
    // Direct check if value is a valid role (exact match)
    if (VALID_ROLES_SET.has(trimmedValue as RolesEnum)) {
      return trimmedValue as RolesEnum;
    }

    const normalizedValue = trimmedValue.toLowerCase();
    const validRole = VALID_ROLES.find(
      (role) => role.toLowerCase() === normalizedValue,
    );

    if (!validRole) {
      throw new BadRequestException(
        `Invalid role. '${RolesEnum.BACKEND_USER}' is a group role and cannot be used as a path parameter. Valid roles are: administrator, owner, staffmember, customer, teacher`,
      );
    }

    return validRole;
  }
}

