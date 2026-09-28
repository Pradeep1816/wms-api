import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerDiscount } from '../../customer/entities/customer-discount.entity';
import { User } from '../../user/entities/user.entity';
import { CustomersInfoRepository } from './customers-info.repository';
import { AuditTrailService } from '../../audit-trail/services/audit-trail.service';

@Injectable()
export class CustomersInfoDiscountRepository {
  constructor(
    @InjectRepository(CustomerDiscount)
    private readonly customerDiscountRepository: Repository<CustomerDiscount>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly customersInfoRepository: CustomersInfoRepository,
    private readonly auditTrailService: AuditTrailService,
  ) {}

  /**
   * Create or update customer discount
   * Based on legacy actionCreate functionality
   */
  async create(customerId: number, locationId: number, discountData: any, currentUserId: number): Promise<any> {
    const queryRunner = this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    queryRunner.data = {
      ...(queryRunner.data ?? {}),
      currentUserId,
    };
    await queryRunner.startTransaction();

    try {
      // Verify customer exists
      const customer = await queryRunner.manager
        .createQueryBuilder()
        .select('user')
        .from('user', 'user')
        .leftJoin('user_location', 'userLocation', 'userLocation.user_id = user.id')
        .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
        .where('user.id = :customerId', { customerId })
        .andWhere('userLocation.location_id = :locationId', { locationId })
        .andWhere('authAssignment.item_name = :role', { role: 'customer' })
        .andWhere('user.isDeleted = false')
        .getRawOne();

      if (!customer) {
        throw new Error('Customer not found');
      }

      // Check if discount already exists
      const existingDiscount = await queryRunner.manager
        .createQueryBuilder()
        .select('customerDiscount')
        .from('customer_discount', 'customerDiscount')
        .where('customerDiscount.customerId = :customerId', { customerId })
        .andWhere('customerDiscount.isDeleted = false')
        .getRawOne();

      if (existingDiscount) {
        // Update existing discount
        await queryRunner.manager
          .createQueryBuilder()
          .update('customer_discount')
          .set({
            value: discountData.value,
          })
          .where('customerId = :customerId', { customerId })
          .andWhere('isDeleted = false')
          .execute();
      } else {
        // Create new discount
        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into('customer_discount')
          .values({
            customerId: customerId,
            value: discountData.value,
            isDeleted: false,
          })
          .execute();
      }

      await queryRunner.commitTransaction();

      if (existingDiscount) {
        const discountId = existingDiscount.customerDiscount_id ?? existingDiscount.id ?? customerId;

        try {
          await this.auditTrailService.writeEntry(queryRunner.manager, {
            modelType: 'common\\models\\CustomerDiscount',
            foreignPk: { id: discountId },
            userId: ((queryRunner.data?.currentUserId as number | undefined) ?? 727),
            type: 'update',
            data: {
              before: {
                value: existingDiscount.customerDiscount_value ?? existingDiscount.value,
              },
              after: {
                value: discountData.value,
              },
            },
          });
        } catch (auditError) {
          console.error('Failed to write CustomerDiscount update audit entry:', auditError);
        }
      }

      // Return updated discount data
      return await this.customersInfoRepository.getCustomerDiscount(customerId, locationId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Update customer discount
   * Same logic as create since it's upsert
   */
  async update(customerId: number, locationId: number, discountData: any, currentUserId: number): Promise<any> {
    return await this.create(customerId, locationId, discountData, currentUserId);
  }
}
