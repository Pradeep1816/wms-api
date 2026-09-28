import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { CustomersInfoRepository } from './customers-info.repository';

@Injectable()
export class CustomersInfoProfileRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly customersInfoRepository: CustomersInfoRepository,
  ) {}

  /**
   * Update customer profile
   */
  async update(customerId: number, locationId: number, profileData: any): Promise<any> {
    const queryRunner = this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get customer with profile and referral source
      const customer = await queryRunner.manager
        .createQueryBuilder()
        .select('user')
        .from('user', 'user')
        .leftJoinAndSelect('user_profile', 'profile', 'profile.user_id = user.id')
        .leftJoinAndSelect('customer_referral_sources', 'customerReferralSource', 'customerReferralSource.userId = user.id')
        .leftJoinAndSelect('referral_sources', 'referralSource', 'referralSource.id = customerReferralSource.referralSourceId')
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

      // Update user profile
      if (profileData.firstname || profileData.lastname) {
        const profileUpdateData: any = {};
        if (profileData.firstname) profileUpdateData.firstname = profileData.firstname;
        if (profileData.lastname) profileUpdateData.lastname = profileData.lastname;

        await queryRunner.manager
          .createQueryBuilder()
          .update('user_profile')
          .set(profileUpdateData)
          .where('user_id = :customerId', { customerId })
          .execute();
      }

      // Update referral source
      if (profileData.referralSourceId !== undefined) {
        if (profileData.referralSourceId) {
          // Check if referral source exists
          const referralSource = await queryRunner.manager
            .createQueryBuilder()
            .select('referralSource')
            .from('referral_sources', 'referralSource')
            .where('referralSource.id = :referralSourceId', { referralSourceId: profileData.referralSourceId })
            .getRawOne();

          if (!referralSource) {
            throw new Error('Invalid referral source ID');
          }

          // Check if customer already has a referral source
          const existingReferralSource = await queryRunner.manager
            .createQueryBuilder()
            .select('customerReferralSource')
            .from('customer_referral_sources', 'customerReferralSource')
            .where('customerReferralSource.userId = :customerId', { customerId })
            .getRawOne();

          const referralSourceData: any = {
            userId: customerId,
            referralSourceId: profileData.referralSourceId,
          };

          // If it's not "Other" (ID 4), clear description
          if (profileData.referralSourceId !== 4) {
            referralSourceData.description = null;
          } else if (profileData.referralSourceDescription) {
            // If it's "Other", set the description
            referralSourceData.description = profileData.referralSourceDescription;
          }

          if (existingReferralSource) {
            // Update existing referral source
            await queryRunner.manager
              .createQueryBuilder()
              .update('customer_referral_sources')
              .set(referralSourceData)
              .where('userId = :customerId', { customerId })
              .execute();
          } else {
            // Create new referral source
            await queryRunner.manager
              .createQueryBuilder()
              .insert()
              .into('customer_referral_sources')
              .values(referralSourceData)
              .execute();
          }
        } else {
          // Remove referral source if referralSourceId is null/empty
          await queryRunner.manager
            .createQueryBuilder()
            .delete()
            .from('customer_referral_sources')
            .where('userId = :customerId', { customerId })
            .execute();
        }
      }

      await queryRunner.commitTransaction();

      // Return updated profile data
      return await this.customersInfoRepository.getCustomerProfile(customerId, locationId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
