import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAddress } from '../entities/user-address.entity';
import { UserContact } from '../entities/user-contact.entity';
import { User } from '../entities/user.entity';
import { getStandardLabelId } from '../enums/label.enum';
import { UserInfoTransformationService } from '../services/transformations/user-info-transformation.service';
import { AuditTrailService } from '../../audit-trail/services/audit-trail.service';

@Injectable()
export class UsersInfoAddressRepository {
  constructor(
    @InjectRepository(UserAddress)
    private readonly userAddressRepository: Repository<UserAddress>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly userInfoTransformationService: UserInfoTransformationService,
    private readonly auditTrailService: AuditTrailService,
  ) {}

  /**
   * Get user addresses with contact information
   */
  async getUserAddresses(
    userId: number,
    locationId: number,
    role?: string,
    isUser = false,
  ): Promise<any[]> {
    const query = this.userAddressRepository
      .createQueryBuilder('userAddress')
      .leftJoinAndSelect('userAddress.userContact', 'userContact')
      .leftJoinAndSelect('userContact.label', 'label')
      .leftJoinAndSelect('userAddress.city', 'city')
      .leftJoinAndSelect('userAddress.province', 'province')
      .leftJoinAndSelect('userAddress.country', 'country')
      .leftJoinAndSelect('userContact.user', 'user')
      .leftJoinAndSelect('user.userLocation', 'userLocation')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .where('user.id = :userId', { userId })
      .andWhere('authAssignment.item_name = :role', { role})
      .andWhere('userAddress.isDeleted = false')
      .andWhere('userContact.isDeleted = false')
      .andWhere('user.isDeleted = false')
      .orderBy('userContact.isPrimary', 'DESC') // Primary addresses first
      .addOrderBy('userAddress.id', 'ASC');

    // If user is a customer or teacher, enforce location
    if (isUser) {
      query.andWhere('userLocation.locationId = :locationId', { locationId });
    }

    return await query.getMany();
  }

  
  /**
   * Create user info based on role type
   */

  async create(
    userId: number,
    locationId: number,
    role: string,
    isUser: boolean,
    addressData: any,
    currentUserId?: number,
  ): Promise<any> {
    const queryRunner = this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    if (currentUserId) {
      queryRunner.data.currentUserId = currentUserId;
    }

    try {
      // Verify user exists with correct role
      const userQuery = queryRunner.manager
        .createQueryBuilder()
        .select('user')
        .from('user', 'user')
        .leftJoin('user_location', 'userLocation', 'userLocation.user_id = user.id')
        .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
        .where('user.id = :userId', { userId })
        .andWhere('authAssignment.item_name = :role', { role })
        .andWhere('user.isDeleted = false');

      if (isUser) {
        userQuery.andWhere('userLocation.location_id = :locationId', { locationId });
      }

      const user = await userQuery.getRawOne();

      if (!user) {
        throw new Error('User not found');
      }

      // Handle label
      let labelId = await this.getOrCreateLabel(queryRunner, addressData.label, userId);

      // Handle city
      let cityId = await this.getOrCreateCity(queryRunner, addressData.city, addressData.cityId, addressData.provinceId);

      // Create user contact
      const contactData = {
        userId: userId,
        labelId: labelId || UserContact.LABEL_OTHER, // Default to "Other" if no label specified
        isPrimary: addressData.isPrimary ? 1 : 0,
        isDeleted: false,
      };

      const contactResult = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into('user_contact')
        .values(contactData)
        .execute();

      const contactId = contactResult.identifiers[0].id;

      // Create address
      const addressInsertData = {
        userContactId: contactId,
        address: addressData.address,
        postalCode: addressData.postalCode || '',
        cityId: cityId,
        provinceId: addressData.provinceId,
        countryId: addressData.countryId,
        isDeleted: false,
      };

      const addressResult = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into('user_address')
        .values(addressInsertData)
        .execute();

      const addressId = addressResult.identifiers[0].id;

      await queryRunner.commitTransaction();

      // Return only the created address information
      return {
        id: addressId,
        address: addressData.address,
        postalCode: addressData.postalCode || '',
        cityId: cityId,
        city: addressData.city || null,
        provinceId: addressData.provinceId,
        countryId: addressData.countryId,
        label: addressData.label || null,
        isPrimary: addressData.isPrimary || false,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async getOrCreateLabel(queryRunner: any, labelName: string, userId: number): Promise<number | undefined> {
    if (!labelName) {
      return undefined;
    }

    // Check if it's a standard label
    const standardLabelId = getStandardLabelId(labelName);
    if (standardLabelId !== undefined) {
      return standardLabelId;
    }

    // Check if custom label already exists
    const existingLabel = await queryRunner.manager
      .createQueryBuilder()
      .select('label')
      .from('label', 'label')
      .where('label.name = :labelName', { labelName })
      .andWhere('label.userAdded = :userId', { userId })
      .getRawOne();

    if (existingLabel) {
      return existingLabel.label_id;
    }

    // Create new custom label
    const labelResult = await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into('label')
      .values({
        name: labelName,
        userAdded: userId,
      })
      .execute();

    return labelResult.identifiers[0].id;
  }

  async update(
    userId: number,
    locationId: number,
    role: string,
    isUser: boolean,
    addressData: any,
    currentUserId?: number,
  ): Promise<any> {
    const queryRunner = this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    if (currentUserId) {
      queryRunner.data.currentUserId = currentUserId;
    }

    try {
      // If updating existing address
      if (addressData.id) {
        return await this.updateExistingAddress(queryRunner, userId, locationId, role, isUser, addressData, currentUserId);
      } else {
        // Creating new address (fallback to create method)
        return await this.create(userId, locationId, role, isUser, addressData, currentUserId);
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async updateExistingAddress(
    queryRunner: any,
    userId: number,
    locationId: number,
    role: string,
    isUser: boolean,
    addressData: any,
    currentUserId?: number,
  ): Promise<any> {
    // Build query to get existing address with user contact
    const addressQuery = queryRunner.manager
      .createQueryBuilder()
      .select('userAddress')
      .from('user_address', 'userAddress')
      .leftJoinAndSelect('user_contact', 'userContact', 'userContact.id = userAddress.userContactId')
      .leftJoinAndSelect('user', 'user', 'user.id = userContact.userId')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .where('userAddress.id = :addressId', { addressId: addressData.id })
      .andWhere('user.id = :userId', { userId })
      .andWhere('authAssignment.item_name = :role', { role })
      .andWhere('userAddress.isDeleted = false')
      .andWhere('user.isDeleted = false');

    if (isUser) {
      addressQuery.leftJoin('user_location', 'userLocation', 'userLocation.user_id = user.id')
        .andWhere('userLocation.location_id = :locationId', { locationId });
    }

    const existingAddress = await addressQuery.getRawOne();

    if (!existingAddress) {
      throw new NotFoundException('Address not found or does not belong to this user');
    }

    // Handle label
    let labelId = await this.getOrCreateLabel(queryRunner, addressData.label, userId);

    // Handle city
    let cityId = await this.getOrCreateCity(queryRunner, addressData.city, addressData.cityId, addressData.provinceId);

    // Update user contact (label and primary status)
    const contactUpdateData: any = {};
    if (labelId !== undefined) contactUpdateData.labelId = labelId;
    if (addressData.isPrimary !== undefined) contactUpdateData.isPrimary = addressData.isPrimary ? 1 : 0;

    if (Object.keys(contactUpdateData).length > 0) {
      await queryRunner.manager
        .createQueryBuilder()
        .update('user_contact')
        .set(contactUpdateData)
        .where('id = :contactId', { contactId: existingAddress.userContact_id })
        .execute();
    }

    // Update address
    const addressUpdateData: any = {};
    if (addressData.address) addressUpdateData.address = addressData.address;
    if (addressData.postalCode !== undefined) addressUpdateData.postalCode = addressData.postalCode;
    if (cityId !== undefined) addressUpdateData.cityId = cityId;
    if (addressData.provinceId !== undefined) addressUpdateData.provinceId = addressData.provinceId;
    if (addressData.countryId !== undefined) addressUpdateData.countryId = addressData.countryId;

    if (Object.keys(addressUpdateData).length > 0) {
      await queryRunner.manager
        .createQueryBuilder()
        .update('user_address')
        .set(addressUpdateData)
        .where('id = :addressId', { addressId: addressData.id })
        .execute();
    }

    await queryRunner.commitTransaction();

    try {
      await this.auditTrailService.writeEntry(queryRunner.manager, {
        modelType: 'common\\models\\UserAddress',
        foreignPk: { id: addressData.id },
        userId: ((queryRunner.data?.currentUserId as number | undefined) ?? currentUserId ?? 727),
        type: 'update',
        data: {
          before: {
            address: existingAddress.userAddress_address,
            postalCode: existingAddress.userAddress_postalCode,
            cityId: existingAddress.userAddress_cityId,
            provinceId: existingAddress.userAddress_provinceId,
            countryId: existingAddress.userAddress_countryId,
            labelId: existingAddress.userContact_labelId,
            isPrimary: existingAddress.userContact_isPrimary,
          },
          after: {
            address: addressData.address || existingAddress.userAddress_address,
            postalCode: addressData.postalCode !== undefined ? addressData.postalCode : existingAddress.userAddress_postalCode,
            cityId: cityId !== undefined ? cityId : existingAddress.userAddress_cityId,
            provinceId: addressData.provinceId !== undefined ? addressData.provinceId : existingAddress.userAddress_provinceId,
            countryId: addressData.countryId !== undefined ? addressData.countryId : existingAddress.userAddress_countryId,
            labelId: labelId !== undefined ? labelId : existingAddress.userContact_labelId,
            isPrimary: addressData.isPrimary !== undefined ? (addressData.isPrimary ? 1 : 0) : existingAddress.userContact_isPrimary,
          },
        },
      });
    } catch (auditError) {
      console.error('Failed to write UserAddress update audit entry:', auditError);
    }

    // Return only the updated address information
    return {
      id: addressData.id,
      address: addressData.address || existingAddress.userAddress_address,
      postalCode: addressData.postalCode !== undefined ? addressData.postalCode : existingAddress.userAddress_postalCode,
      cityId: cityId !== undefined ? cityId : existingAddress.userAddress_cityId,
      city: addressData.city || null,
      provinceId: addressData.provinceId !== undefined ? addressData.provinceId : existingAddress.userAddress_provinceId,
      countryId: addressData.countryId !== undefined ? addressData.countryId : existingAddress.userAddress_countryId,
      label: addressData.label || null,
      isPrimary: addressData.isPrimary !== undefined ? addressData.isPrimary : (existingAddress.userContact_isPrimary === 1),
    };
  }

  async delete(
    userId: number,
    locationId: number,
    role: string,
    isUser: boolean,
    addressId: number,
    currentUserId?: number,
  ): Promise<any> {
    const queryRunner = this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    if (currentUserId) {
      queryRunner.data.currentUserId = currentUserId;
    }

    try {
      const addressQuery = queryRunner.manager
        .createQueryBuilder()
        .select('userAddress')
        .from('user_address', 'userAddress')
        .leftJoinAndSelect('user_contact', 'userContact', 'userContact.id = userAddress.userContactId')
        .leftJoinAndSelect('user', 'user', 'user.id = userContact.userId')
        .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
        .where('userAddress.id = :addressId', { addressId })
        .andWhere('user.id = :userId', { userId })
        .andWhere('authAssignment.item_name = :role', { role })
        .andWhere('userAddress.isDeleted = false')
        .andWhere('user.isDeleted = false');

      if (isUser) {
        addressQuery
          .leftJoin('user_location', 'userLocation', 'userLocation.user_id = user.id')
          .andWhere('userLocation.location_id = :locationId', { locationId });
      }

      const existingAddress = await addressQuery.getRawOne();

      if (!existingAddress) {
        throw new NotFoundException('Address not found or does not belong to this user');
      }

      const contactId = existingAddress.userContact_id;

      await queryRunner.manager
        .createQueryBuilder()
        .delete()
        .from('user_contact')
        .where('id = :contactId', { contactId })
        .execute();

      await queryRunner.manager
        .createQueryBuilder()
        .update('user_address')
        .set({ isDeleted: true })
        .where('id = :addressId', { addressId })
        .execute();

      try {
        await this.auditTrailService.writeEntry(queryRunner.manager, {
          modelType: 'common\\models\\UserAddress',
          foreignPk: { id: addressId },
          userId: ((queryRunner.data?.currentUserId as number | undefined) ?? currentUserId ?? 727),
          type: 'delete',
          data: null,
        });
      } catch (auditError) {
        console.error('Failed to write UserAddress delete audit entry:', auditError);
      }

      await queryRunner.commitTransaction();

      return {
        id: addressId,
        type: 'address',
        deleted: true,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async getOrCreateCity(queryRunner: any, cityName: string, cityId: number, provinceId: number): Promise<number | undefined> {
    // If cityId is provided and is numeric, use it
    if (cityId && !isNaN(cityId)) {
      return cityId;
    }

    // If cityName is provided, try to find or create city
    if (cityName && provinceId) {
      // Check if city already exists
      const existingCity = await queryRunner.manager
        .createQueryBuilder()
        .select('city')
        .from('city', 'city')
        .where('city.name = :cityName', { cityName })
        .andWhere('city.provinceId = :provinceId', { provinceId })
        .getRawOne();

      if (existingCity) {
        return existingCity.city_id;
      }

      // Create new city
      const cityResult = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into('city')
        .values({
          name: cityName,
          provinceId: provinceId,
        })
        .execute();

      return cityResult.identifiers[0].id;
    }

    return undefined;
  }
}
