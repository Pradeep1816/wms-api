import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RbacAuthAssignment } from '../../auth/entities/rbac-auth-assignment.entity';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { CustomerAccount } from '../../customer/entities/customer-account.entity';
import { User } from '../../user/entities/user.entity';

export interface CustomerBalanceCronCounts {
  totalCustomers: number;
  customersWithAccounts: number;
  customersWithoutAccounts: number;
}

@Injectable()
export class CustomerBalanceCronRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RbacAuthAssignment)
    private readonly rbacAuthAssignmentRepository: Repository<RbacAuthAssignment>,
  ) {}

  async getTargetCounts(): Promise<CustomerBalanceCronCounts> {
    const customerIdsSubquery = this.getCustomerIdsSubquery();

    const [totalCustomers, customersWithAccounts] = await Promise.all([
      this.userRepository
        .createQueryBuilder('user')
        .where('user.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('user.status = :status', { status: User.STATUS_ACTIVE })
        .andWhere(`user.id IN (${customerIdsSubquery.getQuery()})`)
        .setParameters(customerIdsSubquery.getParameters())
        .distinct(true)
        .getCount(),
      this.userRepository
        .createQueryBuilder('user')
        .innerJoin(CustomerAccount, 'customerAccount', 'customerAccount.customerId = user.id')
        .where('user.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('user.status = :status', { status: User.STATUS_ACTIVE })
        .andWhere(`user.id IN (${customerIdsSubquery.getQuery()})`)
        .setParameters(customerIdsSubquery.getParameters())
        .distinct(true)
        .getCount(),
    ]);

    return {
      totalCustomers,
      customersWithAccounts,
      customersWithoutAccounts: totalCustomers - customersWithAccounts,
    };
  }

  async getTargetCustomerIds(afterId: number | null, limit: number): Promise<number[]> {
    const customerIdsSubquery = this.getCustomerIdsSubquery();
    const query = this.userRepository
      .createQueryBuilder('user')
      .select('user.id', 'id')
      .where('user.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('user.status = :status', { status: User.STATUS_ACTIVE })
      .andWhere(`user.id IN (${customerIdsSubquery.getQuery()})`)
      .setParameters(customerIdsSubquery.getParameters())
      .orderBy('user.id', 'ASC')
      .limit(limit)
      .distinct(true);

    if (afterId !== null) {
      query.andWhere('user.id > :afterId', { afterId });
    }

    const rows = await query.getRawMany<{ id: string | number }>();
    return rows.map(row => Number(row.id)).filter(id => Number.isFinite(id));
  }

  private getCustomerIdsSubquery() {
    return this.rbacAuthAssignmentRepository
      .createQueryBuilder('raa')
      .select('CAST(raa.user_id AS UNSIGNED)')
      .where('raa.item_name = :customerRole', { customerRole: RolesEnum.CUSTOMER });
  }
}
