import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { User } from '../entities/user.entity';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { StudentRepository } from '../../student/repositories/student.repository';

@Injectable()
export class UserListRepository {


  private static readonly ROLES_ENUM = [
    RolesEnum.CUSTOMER,
    RolesEnum.TEACHER,
    RolesEnum.STAFFMEMBER,
    RolesEnum.OWNER,
  ];

  private static readonly CREDIT_THRESHOLD = -0.09;

  private static readonly SORT_MAPPING = {
    firstName: 'profile.firstname',
    lastName: 'profile.lastname',
    email: 'emails.email',
    phone: 'phones.number',
    customer: 'profile.lastname',
  } as const;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly studentRepository: StudentRepository,
  ) { }

  /**
   * Get users by location and role with filtering and sorting
   * @param locationId - The location ID
   * @param role - The role to filter by (teacher, administrator, staffmember, owner, customer)
   * @param options - Filter and sort options
   * @returns Object with users array and total count
   */
  async findUsersByLocationAndRole(
    locationId: number,
    role: string,
    options: {
      page?: number;
      limit?: number;
      firstName?: string;
      lastName?: string;
      studentsName?: string;
      email?: string;
      phone?: string;
      balance?: 'all' | 'owing' | 'credit';
      showActive?: boolean;
      showInActive?: boolean;
      showAll?: boolean;
      sort?: 'firstName' | 'lastName' | 'email' | 'phone' | 'customer';
      order?: 'ASC' | 'DESC';
    } = {},
  ): Promise<{ users: any[]; total: number }> {
    const {
      page = 1,
      limit = 20,
      firstName,
      lastName,
      studentsName,
      email,
      phone,
      balance = 'all',
      showActive = false,
      showInActive = false,
      showAll = false,
      sort = 'lastName',
      order = 'ASC',
    } = options;

    const skip = (page - 1) * limit;

    try {
      // Handle student role differently - query from student table
      if (role === RolesEnum.STUDENT) {
          const studentOptions: any = {
          page: options.page || 1,
          limit: options.limit || 20,
          firstName: options.firstName,
          lastName: options.lastName,
          customerName: (options as any).customerName || (options as any).studentsName,
          phoneNumber: (options as any).phoneNumber || options.phone,
          showActive: options.showActive || false,
          showInActive: options.showInActive || false,
          showAll: options.showAll || false,
          sort: (options as any).sort || 'firstName',
          order: options.order || 'ASC',
        };
        return this.studentRepository.getStudentsList(locationId, studentOptions);
      }

      const query = this.buildBaseQuery(role);

      this.applyLocationFilter(query, role, locationId, showAll, showInActive);
      this.applyStatusFilter(query, role, { showActive, showInActive, showAll });
      this.applySearchFilters(query, { firstName, lastName, studentsName, email, phone });
      this.applyBalanceFilter(query, balance);
      this.applySorting(query, sort, order);
      this.applyPagination(query, skip, limit);

      const [users, total] = await query.getManyAndCount();
      return { users, total };
    } catch (error) {
      console.error('Error in findUsersByLocationAndRole repository:', error);
      throw new Error(`Failed to fetch users for location ${locationId} with role ${role}: ${error.message}`);
    }
  }

  /**
   * Build base query with common joins and conditions
   */
  private buildBaseQuery(role: string) {
    return this.userRepository
      .createQueryBuilder('user')
      .distinct(true)
      .leftJoin('user.rbacAuthAssignment', 'rbacAuthAssignment')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.students', 'students', 'students.isDeleted = 0')
      .leftJoinAndSelect('user.contacts', 'contact', 'contact.isDeleted = 0')
      .leftJoinAndSelect('contact.emails', 'emails', 'emails.isDeleted = 0')
      .leftJoinAndSelect('contact.phones', 'phones', 'phones.isDeleted = 0')
      .leftJoinAndSelect('user.customerAccount', 'customerAccount')
      .leftJoinAndSelect('user.userLocation', 'userLocation')
      .leftJoin('user.locationWalkin', 'locationWalkin')
      .where('rbacAuthAssignment.item_name = :role', { role })
      .andWhere('user.isDeleted = 0')
      .andWhere('locationWalkin.customerId IS NULL')
      .andWhere('profile.firstname IS NOT NULL')
      .andWhere('profile.lastname IS NOT NULL');
  }

  /**
   * Apply location filtering and role-specific conditions
   */
  private applyLocationFilter(
    query: any,
    role: string,
    locationId: number,
    showAll: boolean,
    showInActive?: boolean,
  ): void {
    const isSpecificRole = UserListRepository.ROLES_ENUM.includes(role as RolesEnum);

    if (!isSpecificRole) return;

    query.andWhere('userLocation.locationId = :locationId', { locationId });

    // For teachers: when showAll is false and showInActive is false, only show teachers with qualifications
    const needsQualification = role === RolesEnum.TEACHER && !showAll && !showInActive;
    needsQualification && this.applyTeacherQualificationFilter(query);
  }

  /**
   * Apply teacher qualification filter
   * Shows only teachers WITH qualifications
   */
  private applyTeacherQualificationFilter(query: any): void {
    query
      .innerJoin('qualification', 'qualification', 'qualification.teacher_id = user.id')
      .andWhere('qualification.isDeleted = :qualificationNotDeleted', {
        qualificationNotDeleted: false,
      });
  }

  /**
   * Apply teacher qualification join for inactive/not-qualified filters
   */
  private applyTeacherNotQualifiedFilter(query: any): void {
    query.leftJoin(
      'qualification',
      'qualification',
      'qualification.teacher_id = user.id AND qualification.isDeleted = :qualificationNotDeleted',
      {
        qualificationNotDeleted: false,
      },
    );
  }

  /**
   * Apply status filtering based on showActive/showInActive/showAll flags
   */
  private applyStatusFilter(
    query: any,
    role: string,
    filters: { showActive: boolean; showInActive: boolean; showAll: boolean },
  ): void {
    const { showActive, showInActive, showAll } = filters;

    // For teachers, when showInActive is true, show inactive teachers and teachers without qualifications
    if (role === RolesEnum.TEACHER && !showActive && showInActive) {
      this.applyTeacherNotQualifiedFilter(query);
      query.andWhere('(user.status = :notActive OR qualification.id IS NULL)', {
        notActive: User.STATUS_NOT_ACTIVE,
      });
      return;
    }

    // Explicit filters take priority
    if (showActive && !showInActive) {
      query.andWhere('user.status = :active', { active: User.STATUS_ACTIVE });
      return;
    }

    if (!showActive && showInActive) {
      query.andWhere('user.status = :notActive', { notActive: User.STATUS_NOT_ACTIVE });
      return;
    }

    // Default filter when both are false and showAll is false
    if (!showActive && !showInActive && !showAll) {
      const defaultFilter = role === RolesEnum.CUSTOMER
        ? this.getCustomerStatusFilter()
        : this.getNonCustomerStatusFilter();
      defaultFilter(query);
    }

    // When showAll = true, no status filter is applied
  }

  /**
   * Get customer-specific status filter
   * Only for CUSTOMER role - checks customerAccount.balance
   * Shows: Active users OR inactive users with non-zero balance
   */
  private getCustomerStatusFilter() {
    return (query: any) => {
      query.andWhere(
        new Brackets((qb) => {
          qb.where('user.status = :active', { active: User.STATUS_ACTIVE })
            .orWhere(
              new Brackets((qb2) => {
                qb2
                  .where('user.status = :notActive', { notActive: User.STATUS_NOT_ACTIVE })
                  .andWhere('customerAccount.balance != 0');
              }),
            );
        }),
      );
    };
  }

  /**
   * Get common status filter for all non-customer roles
   * Used for: TEACHER, STAFFMEMBER, OWNER, ADMINISTRATOR
   * Shows: Active users only (no balance check since they don't have customer accounts)
   */
  private getNonCustomerStatusFilter() {
    return (query: any) => {
      query.andWhere('user.status = :active', { active: User.STATUS_ACTIVE });
    };
  }

  /**
   * Apply search filters (firstName, lastName, studentsName, email, phone)
   */
  private applySearchFilters(
    query: any,
    filters: {
      firstName?: string;
      lastName?: string;
      studentsName?: string;
      email?: string;
      phone?: string;
    },
  ): void {
    const searchFilters = [
      {
        condition: filters.firstName?.trim(),
        query: 'profile.firstname LIKE :firstName',
        params: { firstName: `%${filters.firstName?.trim()}%` },
      },
      {
        condition: filters.lastName?.trim(),
        query: 'profile.lastname LIKE :lastName',
        params: { lastName: `%${filters.lastName?.trim()}%` },
      },
      {
        condition: filters.studentsName?.trim(),
        query: '(students.firstName LIKE :studentsName OR students.lastName LIKE :studentsName OR CONCAT(students.firstName, \' \', students.lastName) LIKE :studentsName)',
        params: { studentsName: `%${filters.studentsName?.trim()}%` },
      },
      {
        condition: filters.email?.trim(),
        query: 'emails.email LIKE :email',
        params: { email: `%${filters.email?.trim()}%` },
      },
      {
        condition: filters.phone?.trim(),
        query: 'phones.number LIKE :phone',
        params: { phone: `%${filters.phone?.trim()}%` },
      },
    ];

    searchFilters
      .filter((filter) => filter.condition)
      .forEach(({ query: queryString, params }) => {
        query.andWhere(queryString, params);
      });
  }

  /**
   * Apply balance filter
   */
  private applyBalanceFilter(query: any, balance: 'all' | 'owing' | 'credit'): void {
    const balanceFilters = {
      owing: (q: any) => q.andWhere('customerAccount.balance > 0'),
      credit: (q: any) =>
        q.andWhere('customerAccount.balance < :creditThreshold', {
          creditThreshold: UserListRepository.CREDIT_THRESHOLD,
        }),
      all: () => { }, // No filter
    };

    balanceFilters[balance]?.(query);
  }

  /**
   * Apply sorting
   */
  private applySorting(query: any, sort: string, order: string): void {
    const sortField =
      UserListRepository.SORT_MAPPING[sort as keyof typeof UserListRepository.SORT_MAPPING] ||
      'profile.lastname';
    query.orderBy(sortField, order.toUpperCase() as 'ASC' | 'DESC');
  }

  /**
   * Apply pagination
   */
  private applyPagination(query: any, skip: number, limit: number): void {
    query.skip(skip).take(limit);
  }
}
