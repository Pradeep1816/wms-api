import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RbacAuthAssignment } from '../../auth/entities/rbac-auth-assignment.entity';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { Student } from '../../student/entities/student.entity';
import { User } from '../../user/entities/user.entity';

export interface CustomerStatusSyncCounts {
  totalCustomers: number;
  activeCustomers: number;
  inactiveCustomers: number;
}

@Injectable()
export class CustomerStatusCronRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(RbacAuthAssignment)
    private readonly rbacAuthAssignmentRepository: Repository<RbacAuthAssignment>,
  ) {}

  async getTargetCounts(): Promise<CustomerStatusSyncCounts> {
    const activeCustomerIdsSubquery = this.getActiveCustomerIdsSubquery();

    const [totalCustomers, activeCustomers] = await Promise.all([
      this.userRepository
        .createQueryBuilder('user')
        .innerJoin(
          RbacAuthAssignment,
          'raa',
          'raa.user_id = CAST(user.id AS CHAR) AND raa.item_name = :role',
          { role: RolesEnum.CUSTOMER },
        )
        .where('user.isDeleted = :isDeleted', { isDeleted: false })
        .distinct(true)
        .getCount(),
      this.userRepository
        .createQueryBuilder('user')
        .innerJoin(
          RbacAuthAssignment,
          'raa',
          'raa.user_id = CAST(user.id AS CHAR) AND raa.item_name = :role',
          { role: RolesEnum.CUSTOMER },
        )
        .where('user.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere(`user.id IN (${activeCustomerIdsSubquery.getQuery()})`)
        .setParameters(activeCustomerIdsSubquery.getParameters())
        .distinct(true)
        .getCount(),
    ]);

    return {
      totalCustomers,
      activeCustomers,
      inactiveCustomers: totalCustomers - activeCustomers,
    };
  }

  async updateActiveCustomers(): Promise<void> {
    const customerIdsSubquery = this.getCustomerIdsSubquery();
    const activeCustomerIdsSubquery = this.getActiveCustomerIdsSubquery();

    await this.userRepository
      .createQueryBuilder()
      .update(User)
      .set({
        status: User.STATUS_ACTIVE,
        updated_at: () => 'UNIX_TIMESTAMP()',
      })
      .where(`id IN (${customerIdsSubquery.getQuery()})`)
      .andWhere(`id IN (${activeCustomerIdsSubquery.getQuery()})`)
      .setParameters({
        ...customerIdsSubquery.getParameters(),
        ...activeCustomerIdsSubquery.getParameters(),
      })
      .execute();
  }

  async updateInactiveCustomers(): Promise<void> {
    const customerIdsSubquery = this.getCustomerIdsSubquery();
    const activeCustomerIdsSubquery = this.getActiveCustomerIdsSubquery();

    await this.userRepository
      .createQueryBuilder()
      .update(User)
      .set({
        status: User.STATUS_NOT_ACTIVE,
        updated_at: () => 'UNIX_TIMESTAMP()',
      })
      .where(`id IN (${customerIdsSubquery.getQuery()})`)
      .andWhere(`id NOT IN (${activeCustomerIdsSubquery.getQuery()})`)
      .setParameters({
        ...customerIdsSubquery.getParameters(),
        ...activeCustomerIdsSubquery.getParameters(),
      })
      .execute();
  }

  private getCustomerIdsSubquery() {
    return this.rbacAuthAssignmentRepository
      .createQueryBuilder('raa')
      .select('CAST(raa.user_id AS UNSIGNED)')
      .where('raa.item_name = :customerRole', { customerRole: RolesEnum.CUSTOMER });
  }

  private getActiveCustomerIdsSubquery() {
    return this.studentRepository
      .createQueryBuilder('student')
      .select('student.customerId')
      .where('student.isDeleted = :studentDeleted', { studentDeleted: 0 })
      .andWhere('student.status = :studentStatus', { studentStatus: 1 })
      .andWhere('student.customerId IS NOT NULL')
      .distinct(true);
  }
}
