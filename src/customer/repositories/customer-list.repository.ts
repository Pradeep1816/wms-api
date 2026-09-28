import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { User } from '../../user/entities/user.entity';

export interface CustomerListRepositoryOptions {
  page: number;
  limit: number;
  status: number;
  walkinCustomers: boolean;
  search?: string;
}

@Injectable()
export class CustomersRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findCustomers(
    locationId: number,
    options: CustomerListRepositoryOptions,
  ): Promise<{ customers: any[]; total: number }> {
    const { page, limit, status, walkinCustomers, search } = options;

    const roles = walkinCustomers ? ['customer', 'guest'] : ['customer'];

    // Calculate skip for pagination
    const skip = (page - 1) * limit;

    // Build the main query
    let dbQuery = this.userRepository
      .createQueryBuilder('user')
      .distinct(true)
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoin('user.userLocation', 'userLocation')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .where('authAssignment.item_name IN (:...roles)', { roles })
      .andWhere('user.isDeleted = 0')
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .andWhere('profile.firstname IS NOT NULL')
      .andWhere('profile.lastname IS NOT NULL');

    if (!walkinCustomers) {
      dbQuery = dbQuery
        .leftJoin('user.locationWalkin', 'locationWalkin')
        .andWhere('locationWalkin.customerId IS NULL');
    }

    if (status === 1) {
      // Active customers only
      dbQuery = dbQuery.andWhere('user.status = :activeStatus', { activeStatus: User.STATUS_ACTIVE });
    } else if (status === 2) {
      // Inactive customers only
      dbQuery = dbQuery.andWhere('user.status = :inactiveStatus', { inactiveStatus: User.STATUS_NOT_ACTIVE });
    }

    // Apply search filter
    dbQuery = this.applySearchFilter(dbQuery, search);

    dbQuery = dbQuery.skip(skip).take(limit);

    // Build count query
    let countQuery = this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.profile', 'profile')
      .leftJoin('user.userLocation', 'userLocation')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .where('authAssignment.item_name IN (:...roles)', { roles })
      .andWhere('user.isDeleted = 0')
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .andWhere('profile.firstname IS NOT NULL')
      .andWhere('profile.lastname IS NOT NULL');

    // Apply walk-in filter to count query
    if (!walkinCustomers) {
      countQuery = countQuery
        .leftJoin('user.locationWalkin', 'locationWalkin')
        .andWhere('locationWalkin.customerId IS NULL');
    }

    // Apply status filter to count query
    if (status === 1) {
      countQuery = countQuery.andWhere('user.status = :activeStatus', { activeStatus: User.STATUS_ACTIVE });
    } else if (status === 2) {
      countQuery = countQuery.andWhere('user.status = :inactiveStatus', { inactiveStatus: User.STATUS_NOT_ACTIVE });
    }

    // Apply search filter to count query
    countQuery = this.applySearchFilter(countQuery, search);

    // Execute both queries in parallel
    const [customers, countResult] = await Promise.all([
      dbQuery.getMany(),
      countQuery.select('COUNT(DISTINCT user.id)', 'count').getRawOne(),
    ]);

    const total = parseInt(countResult?.count || '0', 10);

    return { customers, total };
  }

  /**
   * Apply search filter dynamically
   * Searches by ID (if numeric) OR first name OR last name OR full name
   */
  private applySearchFilter(
    query: SelectQueryBuilder<User>,
    search?: string,
  ): SelectQueryBuilder<User> {
    if (!search || !search.trim()) {
      return query;
    }

    const searchTrimmed = search.trim();
    const searchTerm = `%${searchTrimmed}%`;
    
    const conditions: string[] = [
      'profile.firstname LIKE :searchTerm',
      'profile.lastname LIKE :searchTerm',
      "CONCAT(profile.firstname, ' ', profile.lastname) LIKE :searchTerm",
    ];
    
    const params: Record<string, any> = { searchTerm };

    // Check if search is numeric (for ID search)
    const isNumeric = !isNaN(Number(searchTrimmed)) && searchTrimmed !== '';
    
    if (isNumeric) {
      conditions.push('user.id = :searchId');
      params.searchId = Number(searchTrimmed);
    }

    return query.andWhere(`(${conditions.join(' OR ')})`, params);
  }
}
