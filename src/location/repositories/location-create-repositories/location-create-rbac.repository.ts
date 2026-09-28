import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { RbacAuthItem } from '../../../auth/entities/rbac-auth-item.entity';
import { RbacAuthItemChild } from '../../../auth/entities/rbac-auth-item-child.entity';
import { RolesEnum } from '../../../auth/enums/roles.enum';
import { OWNER_PERMISSIONS, STAFF_PERMISSIONS } from '../../enums/location-rbac-permissions.enum';

/**
 * Step 6: Add RBAC permissions for this location.
 * Legacy: Location::addPermission()
 * - owner: gets ownerPermissions + staffPermissions
 * - staffmember: gets staffPermissions only
 * - administrator: gets ALL permissions
 */
@Injectable()
export class LocationCreateRbacRepository {
  constructor() {}

  async addPermissionsForLocation(
    locationId: number,
    manager: EntityManager,
  ): Promise<void> {
    const itemRepo = manager.getRepository(RbacAuthItem);
    const childRepo = manager.getRepository(RbacAuthItemChild);

    const permissions = await itemRepo.find({
      where: { type: RbacAuthItem.TYPE_PERMISSION },
      select: { name: true },
    });
    const permissionNames = [...new Set(permissions.map((p) => p.name))];
    if (permissionNames.length === 0) return;

    const ownerSet = new Set(OWNER_PERMISSIONS);
    const staffSet = new Set(STAFF_PERMISSIONS);
    const toInsert: Partial<RbacAuthItemChild>[] = [];

    for (const permissionName of permissionNames) {
      if (ownerSet.has(permissionName)) {
        toInsert.push({ parent: RolesEnum.OWNER, child: permissionName, locationId });
      } else if (staffSet.has(permissionName)) {
        toInsert.push({ parent: RolesEnum.OWNER, child: permissionName, locationId });
        toInsert.push({
          parent: RolesEnum.STAFFMEMBER,
          child: permissionName,
          locationId,
        });
      }
      toInsert.push({
        parent: RolesEnum.ADMINISTRATOR,
        child: permissionName,
        locationId,
      });
    }

    const uniqueRows = Array.from(
      new Map(toInsert.map((r) => [`${r.parent}|${r.child}|${r.locationId}`, r])).values(),
    );

    if (uniqueRows.length === 0) return;
  
    await childRepo.insert(uniqueRows);
  }
}
