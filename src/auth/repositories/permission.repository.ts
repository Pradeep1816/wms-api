import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RbacAuthItem } from '../entities/rbac-auth-item.entity';
import { RbacAuthItemChild } from '../entities/rbac-auth-item-child.entity';
import { Location } from '../../location/entities/location.entity';

@Injectable()
export class PermissionRepository {
  constructor(
    @InjectRepository(RbacAuthItem)
    private readonly rbacAuthItemRepository: Repository<RbacAuthItem>,
    @InjectRepository(RbacAuthItemChild)
    private readonly rbacAuthItemChildRepository: Repository<RbacAuthItemChild>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
  ) {}

  async getLocationIdBySlug(slug: string): Promise<number | null> {
    const location = await this.locationRepository
      .createQueryBuilder('location')
      .select('location.id', 'id')
      .where('location.slug = :slug', { slug })
      .limit(1)
      .getRawOne();
    
    return location?.id || null;
  }

  async getLocationSpecificPermissions(): Promise<Array<{ name: string; description: string }>> {
    const queryBuilder = this.rbacAuthItemRepository
      .createQueryBuilder('item')
      .select(['item.name as name', 'item.description as description'])
      .where('item.type = :type', { type: 2 })
      .andWhere('item.isLocationSpecific = :isLocationSpecific', { isLocationSpecific: 1 })
      .orderBy('item.description', 'ASC');

    return queryBuilder.getRawMany();
  }

  /**
   * Get staff role permissions for a specific location
   */
  async getStaffPermissionsByLocation(locationId: number): Promise<Array<{ child: string }>> {
    const queryBuilder = this.rbacAuthItemChildRepository
      .createQueryBuilder('child')
      .select(['child.child as child'])
      .where('child.parent = :parent', { parent: 'staffmember' })
      .andWhere('child.locationId = :locationId', { locationId });

    return queryBuilder.getRawMany();
  }
}
