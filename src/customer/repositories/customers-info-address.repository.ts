import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAddress } from '../../user/entities/user-address.entity';
import { UserContact } from '../../user/entities/user-contact.entity';
import { User } from '../../user/entities/user.entity';
import { CustomersInfoRepository } from './customers-info.repository';
import { AuditTrailService } from '../../audit-trail/services/audit-trail.service';

@Injectable()
export class CustomersInfoAddressRepository {
  constructor(
    @InjectRepository(UserAddress)
    private readonly userAddressRepository: Repository<UserAddress>,
    @InjectRepository(UserContact)
    private readonly userContactRepository: Repository<UserContact>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly customersInfoRepository: CustomersInfoRepository,
    private readonly auditTrailService: AuditTrailService,
  ) {}

  /**
   * Create customer address
   * Based on legacy actionCreateAddress functionality
   */
  async create(customerId: number, locationId: number, addressData: any, currentUserId: number): Promise<any> {
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

      // Handle label
      let labelId = await this.getOrCreateLabel(queryRunner, addressData.label, customerId);

      // Handle city
      let cityId = await this.getOrCreateCity(queryRunner, addressData.city, addressData.cityId, addressData.provinceId);

      // Create user contact
      const contactData = {
        userId: customerId,
        labelId: labelId || 3, // Default to "Other" if no label specified
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

      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into('user_address')
        .values(addressInsertData)
        .execute();

      await queryRunner.commitTransaction();

      // Return updated address data
      return await this.customersInfoRepository.getCustomerAddresses(customerId, locationId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Update customer address
   * Based on legacy actionEditAddress functionality
   */
  async delete(
    customerId: number,
    locationId: number,
    addressId: string,
    auditUserId: number,
  ): Promise<any> {
    const queryRunner = this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    queryRunner.data = {
      ...(queryRunner.data ?? {}),
      currentUserId: auditUserId,
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

      // Find the address contact to delete
      const addressContact = await queryRunner.manager
        .createQueryBuilder()
        .select(['userAddress.id', 'userAddress.userContactId'])
        .from('user_address', 'userAddress')
        .leftJoin('user_contact', 'userContact', 'userContact.id = userAddress.userContactId')
        .where('userAddress.id = :addressId', { addressId })
        .andWhere('userContact.userId = :customerId', { customerId })
        .andWhere('userAddress.isDeleted = false')
        .getRawOne();

      if (!addressContact) {
        throw new Error('Address contact not found');
      }

      const userContactId = addressContact.userAddress_userContactId;

      // Hard delete the user_contact record (like legacy)
      await queryRunner.manager
        .createQueryBuilder()
        .delete()
        .from('user_contact')
        .where('id = :userContactId', { userContactId })
        .execute();

      // Soft delete the address
      await queryRunner.manager
        .createQueryBuilder()
        .update('user_address')
        .set({
          isDeleted: true,
        })
        .where('id = :addressId', { addressId })
        .execute();

      try {
        await this.auditTrailService.writeEntry(queryRunner.manager, {
          modelType: 'common\\models\\UserAddress',
          foreignPk: { id: addressId },
          userId: auditUserId,
          type: 'delete',
          data: null,
        });
      } catch (auditError) {
        console.error('Failed to write UserAddress audit entry:', auditError);
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

  async update(customerId: number, locationId: number, addressData: any, currentUserId: number): Promise<any> {
    const queryRunner = this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    queryRunner.data = {
      ...(queryRunner.data ?? {}),
      currentUserId,
    };
    await queryRunner.startTransaction();

    try {
      // If updating existing address
      if (addressData.id) {
        return await this.updateExistingAddress(queryRunner, customerId, locationId, addressData);
      } else {
        // Creating new address
        return await this.createNewAddress(queryRunner, customerId, locationId, addressData);
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async updateExistingAddress(queryRunner: any, customerId: number, locationId: number, addressData: any): Promise<any> {
    // Get existing address with user contact
    const existingAddress = await queryRunner.manager
      .createQueryBuilder()
      .select('userAddress')
      .from('user_address', 'userAddress')
      .leftJoinAndSelect('user_contact', 'userContact', 'userContact.id = userAddress.userContactId')
      .leftJoinAndSelect('user', 'user', 'user.id = userContact.userId')
      .leftJoin('user_location', 'userLocation', 'userLocation.user_id = user.id')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .where('userAddress.id = :addressId', { addressId: addressData.id })
      .andWhere('user.id = :customerId', { customerId })
      .andWhere('userLocation.location_id = :locationId', { locationId })
      .andWhere('authAssignment.item_name = :role', { role: 'customer' })
      .andWhere('userAddress.isDeleted = false')
      .andWhere('user.isDeleted = false')
      .getRawOne();

    if (!existingAddress) {
      throw new Error('Address not found or does not belong to this customer');
    }

    // Handle label
    let labelId = await this.getOrCreateLabel(queryRunner, addressData.label, customerId);

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
        userId: ((queryRunner.data?.currentUserId as number | undefined) ?? 727),
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
      console.error('Failed to write Customer UserAddress update audit entry:', auditError);
    }

    // Return updated address data
    return await this.customersInfoRepository.getCustomerAddresses(customerId, locationId);
  }

  private async createNewAddress(queryRunner: any, customerId: number, locationId: number, addressData: any): Promise<any> {
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

    // Handle label
    let labelId = await this.getOrCreateLabel(queryRunner, addressData.label, customerId);

    // Handle city
    let cityId = await this.getOrCreateCity(queryRunner, addressData.city, addressData.cityId, addressData.provinceId);

    // Create user contact
    const contactData = {
      userId: customerId,
      labelId: labelId || 3, // Default to "Other" if no label specified
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

    await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into('user_address')
      .values(addressInsertData)
      .execute();

    await queryRunner.commitTransaction();

    // Return updated address data
    return await this.customersInfoRepository.getCustomerAddresses(customerId, locationId);
  }

  private async getOrCreateLabel(queryRunner: any, labelName: string, customerId: number): Promise<number | undefined> {
    if (!labelName) {
      return undefined;
    }

    // Check if it's a standard label
    const standardLabels = {
      'Home': 1,
      'Work': 2,
      'Other': 3,
    };

    if (standardLabels[labelName]) {
      return standardLabels[labelName];
    }

    // Check if custom label already exists
    const existingLabel = await queryRunner.manager
      .createQueryBuilder()
      .select('label')
      .from('label', 'label')
      .where('label.name = :labelName', { labelName })
      .andWhere('label.userAdded = :customerId', { customerId })
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
        userAdded: customerId,
      })
      .execute();

    return labelResult.identifiers[0].id;
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
        .andWhere('city.province_id = :provinceId', { provinceId })
        .andWhere('city.isDeleted = false')
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
          province_id: provinceId,
          isDeleted: false,
        })
        .execute();

      return cityResult.identifiers[0].id;
    }

    return undefined;
  }
}
