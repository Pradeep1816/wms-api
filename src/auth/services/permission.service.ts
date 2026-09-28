import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { RbacAuthItem } from '../entities/rbac-auth-item.entity';
import { RbacAuthAssignment } from '../entities/rbac-auth-assignment.entity';
import { RbacAuthItemChild } from '../entities/rbac-auth-item-child.entity';
import { PermissionRepository } from '../repositories/permission.repository';
import { PermissionDataDto, PermissionItemDto } from '../dto/permission-response.dto';
import { AuditTrailAction, AuditTrailService } from '../../audit-trail/services/audit-trail.service';

@Injectable()
export class PermissionService {
  /** Legacy Yii model name recorded in audit_trail_entry.model_type for role/permission grants. */
  private static readonly AUTH_ITEM_CHILD_MODEL_TYPE = 'common\\models\\AuthItemChild';
  /** Console/system actor used when no authenticated user is available (matches AuditTrailSubscriber). */
  private static readonly CONSOLE_USER_ID = 727;

  constructor(
    @InjectRepository(RbacAuthItem)
    private readonly rbacAuthItemRepository: Repository<RbacAuthItem>,
    @InjectRepository(RbacAuthAssignment)
    private readonly rbacAuthAssignmentRepository: Repository<RbacAuthAssignment>,
    @InjectRepository(RbacAuthItemChild)
    private readonly rbacAuthItemChildRepository: Repository<RbacAuthItemChild>,
    private readonly permissionRepository: PermissionRepository,
    private readonly auditTrailService: AuditTrailService,
  ) {}

  async getLocationSpecificPermissions(): Promise<{ name: string; description: string }[]> {
    try {
      const permissions = await this.rbacAuthItemRepository.find({
        where: { 
          type: 2, // Permission type
          isLocationSpecific: 1 // Location specific permissions
        },
        order: { description: 'ASC' },
      });

      return permissions.map(permission => ({
        name: permission.name,
        description: permission.description || '',
      }));
    } catch (error) {
      return [];
    }
  }

  async getRoles(): Promise<string[]> {
    try {
      const roles = await this.rbacAuthItemRepository.find({
        where: { type: 1 }, // Role type
        order: { name: 'ASC' },
        select: ['name'],
      });

      return roles.map(role => role.name);
    } catch (error) {
      return [];
    }
  }

  async getUserRoles(userId: number): Promise<string[]> {
    try {
      const assignments = await this.rbacAuthAssignmentRepository.find({
        where: { user_id: userId.toString() },
        select: ['item_name'],
      });
      
      return assignments.map(assignment => assignment.item_name);
    } catch (error) {
      return [];
    }
  }

  async getRolePermissions(roleName: string, locationId?: number): Promise<string[]> {
    try {
      const queryBuilder = this.rbacAuthItemChildRepository
        .createQueryBuilder('child')
        .select('child.child', 'permission')
        .where('child.parent = :roleName', { roleName });

      if (locationId) {
        queryBuilder.andWhere('(child.locationId IS NULL OR child.locationId = :locationId)', { locationId });
      }

      const result = await queryBuilder.getRawMany();
      return result.map(row => row.permission);
    } catch (error) {
      return [];
    }
  }

  async getUserPermissions(userId: number, locationId?: number): Promise<string[]> {
    try {
      // Get user roles
      const userRoles = await this.getUserRoles(userId);
      
      if (userRoles.length === 0) {
        return [];
      }
      
      // Get permissions for each role
      const allPermissions = new Set<string>();
      
      for (const role of userRoles) {
        const rolePermissions = await this.getRolePermissions(role, locationId);
        rolePermissions.forEach(permission => allPermissions.add(permission));
      }
      
      return Array.from(allPermissions);
    } catch (error) {
      return [];
    }
  }

  async getDashboardPermissions(userId: number, locationId?: number): Promise<{ [key: string]: boolean }> {
    try {
      // Get all user permissions
      const allPermissions = await this.getUserPermissions(userId, locationId);
      
      // Filter for dashboard permissions and convert to object
      const dashboardPermissions: { [key: string]: boolean } = {};
      allPermissions.forEach(permission => {
        if (permission.startsWith('dashboard') || permission.includes('Enrolment') || permission.includes('Revenue') || permission.includes('Hours')) {
          dashboardPermissions[permission] = true;
        }
      });

      return dashboardPermissions;
    } catch (error) {
      return {};
    }
  }

  async addPermission(
    roleName: string,
    permissionName: string,
    locationId?: number,
    currentUserId?: number,
  ): Promise<boolean> {
    try {
      // IMPORTANT: `rbac_auth_item_child` stores one row per (role, permission,
      // location), but the table has no unique key and the entity's primary key
      // is only (parent, child) — location_id is NOT part of it. Using
      // repository.save() here would make TypeORM treat any existing row for the
      // SAME (parent, child) as "the same entity" and issue an UPDATE that
      // rewrites that row's location_id to THIS location — silently stealing the
      // permission from every other location that already had it. So we must
      // scope by location explicitly and only INSERT when this location does not
      // already have the grant (never save()).
      const existing = await this.rbacAuthItemChildRepository.findOne({
        where: {
          parent: roleName,
          child: permissionName,
          locationId: locationId ?? IsNull(),
        },
      });

      if (existing) {
        return true; // already granted for this location — idempotent, nothing to do
      }

      await this.rbacAuthItemChildRepository.insert({
        parent: roleName,
        child: permissionName,
        locationId: locationId ?? undefined,
      });

      // Record the grant in the audit trail. This entity is written via query
      // builder (insert/delete), which bypasses the global AuditTrailSubscriber,
      // so we log the change explicitly here.
      await this.writeAuditEntry('create', roleName, permissionName, locationId, currentUserId);

      return true;
    } catch (error) {
      console.error('Error adding permission:', error);
      return false;
    }
  }

  async removePermission(
    roleName: string,
    permissionName: string,
    locationId?: number,
    currentUserId?: number,
  ): Promise<boolean> {
    try {
      const queryBuilder = this.rbacAuthItemChildRepository
        .createQueryBuilder()
        .delete()
        .where('parent = :roleName', { roleName })
        .andWhere('child = :permissionName', { permissionName });

      if (locationId) {
        queryBuilder.andWhere('locationId = :locationId', { locationId });
      }

      const result = await queryBuilder.execute();

      // Only audit when a grant was actually removed (delete via query builder
      // bypasses the global AuditTrailSubscriber, so we log it explicitly).
      if (result.affected && result.affected > 0) {
        await this.writeAuditEntry('delete', roleName, permissionName, locationId, currentUserId);
      }

      return true;
    } catch (error) {
      console.error('Error removing permission:', error);
      return false;
    }
  }

  /**
   * Write a role/permission grant change to `audit_trail_entry`.
   * Best-effort: an audit failure must never break the permission change.
   */
  private async writeAuditEntry(
    type: AuditTrailAction,
    roleName: string,
    permissionName: string,
    locationId: number | undefined,
    currentUserId: number | undefined,
  ): Promise<void> {
    const foreignPk = {
      parent: roleName,
      child: permissionName,
      location_id: locationId ?? null,
    };

    try {
      await this.auditTrailService.writeEntry(this.rbacAuthItemChildRepository.manager, {
        modelType: PermissionService.AUTH_ITEM_CHILD_MODEL_TYPE,
        foreignPk,
        userId: currentUserId ?? PermissionService.CONSOLE_USER_ID,
        type,
        data: foreignPk,
      });
    } catch (auditError) {
      console.error('Failed to write AuthItemChild audit entry:', auditError);
    }
  }

  /**
   * update permission
   */
  async updatePermission(
    locationSlug: string,
    permissionName: string,
    enable: boolean,
    currentUserId?: number,
  ): Promise<boolean> {
    const locationId = await this.permissionRepository.getLocationIdBySlug(locationSlug);
    if (!locationId) {
      throw new Error(`Location '${locationSlug}' not found`);
    }

    const roleName = 'staffmember';

    if (enable) {
      return this.addPermission(roleName, permissionName, locationId, currentUserId);
    } else {
      return this.removePermission(roleName, permissionName, locationId, currentUserId);
    }
  }

// GET API
  async getPermissions(locationSlug: string): Promise<PermissionDataDto> {
    try {
      const locationId = await this.permissionRepository.getLocationIdBySlug(locationSlug);
      if (!locationId) {
        throw new Error(`Location '${locationSlug}' not found`);
      }

      const permissions = await this.permissionRepository.getLocationSpecificPermissions();

      const staffPermissionsRaw = await this.permissionRepository.getStaffPermissionsByLocation(locationId);
      const staffPermissionSet = new Set(staffPermissionsRaw.map(p => p.child));

      const permissionItems: PermissionItemDto[] = permissions.map(permission => ({
        description: permission.description || '',
        staffmember: staffPermissionSet.has(permission.name),
        permission: permission.name,
      }));

      return { permissions: permissionItems };
    } catch (error) {
      throw new Error(`Failed to fetch permissions: ${error.message}`);
    }
  }
}