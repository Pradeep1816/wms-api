import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { formatBirthDate } from 'src/utils/date-utils';
import { UserRole } from '../enums/user-role.enum';
import { UserInfoTransformationService } from '../services/transformations/user-info-transformation.service';

interface UserProfileUpdateData {
  firstname?: string;
  lastname?: string;
  birthDate?: string;
  businessName?: string;
  dateStarted?: string;
  referralSourceId?: number;
  referralSourceDescription?: string;

}

interface UserStatusUpdateResult {
  status: number;
  canLogin: boolean;
  accessToken: string;
}

@Injectable()
export class UsersInfoProfileRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly userInfoTransformationService: UserInfoTransformationService,
  ) {}

  //Get user profile details

  async getUserProfile(
    userId: number,
    locationId: number,
    role?: string,
    isUser = false,
  ): Promise<any> {
    const query = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect(
        'user.userLocation',
        'userLocation',
        'userLocation.locationId = :locationId',
        { locationId },
      )
      .leftJoinAndSelect(
        'user.customerReferralSource',
        'customerReferralSource',
      )
      .leftJoinAndSelect(
        'customerReferralSource.referralSource',
        'referralSource',
      )
      .leftJoin(
        'rbac_auth_assignment',
        'authAssignment',
        'authAssignment.user_id = CAST(user.id AS CHAR)',
      )
      .where('user.id = :userId', { userId })
      .andWhere('authAssignment.item_name = :role', { role })
      .andWhere('user.isDeleted = false');

    // If user is a customer or teacher, enforce location
    if (isUser) {
      query.andWhere('userLocation.locationId = :locationId', { locationId });
    }

    const user = await query.getOne();

    if (!user) {
      return [];
    }

    // Get public identity (name)
    const getPublicIdentity = (): string => {
      if (user.profile && (user.profile.firstname || user.profile.lastname)) {
        return `${user.profile.firstname || ''} ${user.profile.lastname || ''}`.trim();
      }
      return user.username || '';
    };

    // Get status
    const getStatus = (): string => {
      return User.getStatusName(user.status);
    };
    // Get role
    const getRole = (): string => {
      return UserRole[role?.toUpperCase() as keyof typeof UserRole] || '';
    };

    // Get referral source
    const getReferralSource = (): string => {
      if (user.customerReferralSource) {
        if (
          user.customerReferralSource.referralSource &&
          user.customerReferralSource.referralSource.id === 4
        ) {
          // If it's "Other", return the description
          return user.customerReferralSource.description || '';
        } else if (user.customerReferralSource.referralSource) {
          // Return the referral source name
          return user.customerReferralSource.referralSource.name || '';
        }
      }
      return '';
    };

    const dateStarted = user.userLocation?.dateStarted ?? null;
    const createdAtFallback =
      !dateStarted && user.created_at ? new Date(user.created_at * 1000) : null;

    return {
      name: getPublicIdentity(),
      role: getRole() || '',
      referralSource: getReferralSource() || '',
      status: getStatus(),
      canLogin: Boolean(user.canLogin),
      birthDate: formatBirthDate(user.profile?.birthDate),
      businessName: user.profile?.businessName || null,
      dateStarted: formatBirthDate(dateStarted ?? createdAtFallback),
      dateStartedIsFallback: Boolean(!dateStarted && createdAtFallback),
    };
  }

  /**
   * Update user profile details
   */
  async update(
    userId: number,
    locationId: number,
    role: string,
    isUser: boolean,
    profileData: UserProfileUpdateData,
  ): Promise<any> {
    const queryRunner =
      this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verify user exists with correct role
      const userQuery = queryRunner.manager
        .createQueryBuilder()
        .select('user')
        .from('user', 'user')
        .leftJoin(
          'user_location',
          'userLocation',
          'userLocation.user_id = user.id',
        )
        .leftJoin(
          'rbac_auth_assignment',
          'authAssignment',
          'authAssignment.user_id = CAST(user.id AS CHAR)',
        )
        .where('user.id = :userId', { userId })
        .andWhere('authAssignment.item_name = :role', { role })
        .andWhere('user.isDeleted = false');

      if (isUser) {
        userQuery.andWhere('userLocation.location_id = :locationId', {
          locationId,
        });
      }

      const user = await userQuery.getRawOne<Record<string, unknown>>();

      if (!user) {
        throw new Error('User not found');
      }

      // Update user profile
      if (
        profileData.firstname ||
        profileData.lastname ||
        profileData.birthDate !== undefined ||
        profileData.businessName !== undefined
      ) {
        const profileUpdateData: {
          firstname?: string;
          lastname?: string;
          birthDate?: Date | null;
          businessName?: string | null;
        } = {};
        if (profileData.firstname)
          profileUpdateData.firstname = profileData.firstname;
        if (profileData.lastname)
          profileUpdateData.lastname = profileData.lastname;
        if (profileData.businessName !== undefined) {
          profileUpdateData.businessName = profileData.businessName
            ? profileData.businessName.trim()
            : null;
        }
        if (profileData.birthDate !== undefined) {
          // Handle birthDate: if it's null/empty string, set to null, otherwise convert to date
          profileUpdateData.birthDate = profileData.birthDate
            ? new Date(profileData.birthDate)
            : null;
        }

        await queryRunner.manager
          .createQueryBuilder()
          .update('user_profile')
          .set(profileUpdateData)
          .where('user_id = :userId', { userId })
          .execute();
      }

      if (profileData.dateStarted !== undefined) {
        await queryRunner.manager
          .createQueryBuilder()
          .update('user_location')
          .set({
            dateStarted: profileData.dateStarted
              ? new Date(profileData.dateStarted)
              : null,
          })
          .where('user_id = :userId', { userId })
          .andWhere('location_id = :locationId', { locationId })
          .execute();
      }

      // Update referral source (only for customers)
      if (role === 'customer' && profileData.referralSourceId !== undefined) {
        if (profileData.referralSourceId) {
          // Check if referral source exists
          const referralSource = await queryRunner.manager
            .createQueryBuilder()
            .select('referralSource')
            .from('referral_sources', 'referralSource')
            .where('referralSource.id = :referralSourceId', {
              referralSourceId: profileData.referralSourceId,
            })
            .getRawOne<Record<string, unknown>>();

          if (!referralSource) {
            throw new Error('Invalid referral source ID');
          }

          // Check if user already has a referral source
          const existingReferralSource = await queryRunner.manager
            .createQueryBuilder()
            .select('customerReferralSource')
            .from('customer_referral_sources', 'customerReferralSource')
            .where('customerReferralSource.userId = :userId', { userId })
            .getRawOne<Record<string, unknown>>();

          const referralSourceData: {
            userId: number;
            referralSourceId: number;
            description?: string | null;
          } = {
            userId: userId,
            referralSourceId: profileData.referralSourceId,
          };

          // If it's not "Other" (ID 4), clear description
          if (profileData.referralSourceId !== 4) {
            referralSourceData.description = null;
          } else if (profileData.referralSourceDescription) {
            // If it's "Other", set the description
            referralSourceData.description =
              profileData.referralSourceDescription;
          }

          if (existingReferralSource) {
            // Update existing referral source
            await queryRunner.manager
              .createQueryBuilder()
              .update('customer_referral_sources')
              .set(referralSourceData)
              .where('userId = :userId', { userId })
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
            .where('userId = :userId', { userId })
            .execute();
        }
      }

      await queryRunner.commitTransaction();

      // Return updated profile data
      const updatedProfile: unknown = await this.getUserProfile(
        userId,
        locationId,
        role,
        isUser,
      );
      const transformedProfile =
        this.userInfoTransformationService.transformProfileToDto(
          updatedProfile,
        );
      return transformedProfile;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async updateStatus(
    userId: number,
    locationId: number,
    role: string,
    isUser: boolean,
    active: boolean,
  ): Promise<UserStatusUpdateResult> {
    const queryRunner =
      this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const userQuery = queryRunner.manager
        .createQueryBuilder()
        .select('user.id', 'id')
        .addSelect('user.access_token', 'access_token')
        .from('user', 'user')
        .leftJoin(
          'user_location',
          'userLocation',
          'userLocation.user_id = user.id',
        )
        .leftJoin(
          'rbac_auth_assignment',
          'authAssignment',
          'authAssignment.user_id = CAST(user.id AS CHAR)',
        )
        .where('user.id = :userId', { userId })
        .andWhere('authAssignment.item_name = :role', { role })
        .andWhere('user.isDeleted = false');

      if (isUser) {
        userQuery.andWhere('userLocation.location_id = :locationId', {
          locationId,
        });
      }

      const user = await userQuery.getRawOne<{ id: number; access_token: string }>();

      if (!user) {
        throw new Error('User not found');
      }

      const nextStatus = active ? User.STATUS_ACTIVE : User.STATUS_NOT_ACTIVE;
      const nextCanLogin = active;

      await queryRunner.manager
        .createQueryBuilder()
        .update(User)
        .set({
          status: nextStatus,
          canLogin: nextCanLogin,
          updated_at: Math.floor(Date.now() / 1000),
        })
        .where('id = :userId', { userId })
        .execute();

      await queryRunner.commitTransaction();

      return {
        status: nextStatus,
        canLogin: nextCanLogin,
        accessToken: user.access_token,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
