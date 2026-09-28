import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPhone } from '../../user/entities/user-phone.entity';
import { UserContact } from '../../user/entities/user-contact.entity';
import { User } from '../../user/entities/user.entity';
import { CustomersInfoRepository } from './customers-info.repository';
import { AuditTrailService } from '../../audit-trail/services/audit-trail.service';

@Injectable()
export class CustomersInfoPhoneRepository {
  constructor(
    @InjectRepository(UserPhone)
    private readonly userPhoneRepository: Repository<UserPhone>,
    @InjectRepository(UserContact)
    private readonly userContactRepository: Repository<UserContact>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly customersInfoRepository: CustomersInfoRepository,
    private readonly auditTrailService: AuditTrailService,
  ) {}

  /**
   * Create customer phone
   * Based on legacy actionCreatePhone functionality
   */
  async create(customerId: number, locationId: number, phoneData: any, currentUserId: number): Promise<any> {
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
      let labelId = await this.getOrCreateLabel(queryRunner, phoneData.label, customerId);

      // Create user contact
      const contactData = {
        userId: customerId,
        labelId: labelId || 3, // Default to "Other" if no label specified
        isPrimary: phoneData.isPrimary ? 1 : 0,
        isDeleted: false,
      };

      const contactResult = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into('user_contact')
        .values(contactData)
        .execute();

      const contactId = contactResult.identifiers[0].id;

      // Create phone
      const phoneInsertData = {
        userContactId: contactId,
        number: phoneData.number,
        extension: phoneData.extension || null,
        note: phoneData.note || '',
        isDeleted: false,
      };

      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into('user_phone')
        .values(phoneInsertData)
        .execute();

      await queryRunner.commitTransaction();

      // Return updated phone data
      return await this.customersInfoRepository.getCustomerPhones(customerId, locationId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Update customer phone
   * Based on legacy actionEditPhone functionality
   */
  async delete(
    customerId: number,
    locationId: number,
    phoneId: string,
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

      // Find the phone contact to delete
      const phoneContact = await queryRunner.manager
        .createQueryBuilder()
        .select(['userPhone.id', 'userPhone.userContactId'])
        .from('user_phone', 'userPhone')
        .leftJoin('user_contact', 'userContact', 'userContact.id = userPhone.userContactId')
        .where('userPhone.id = :phoneId', { phoneId })
        .andWhere('userContact.userId = :customerId', { customerId })
        .andWhere('userPhone.isDeleted = false')
        .getRawOne();

      if (!phoneContact) {
        throw new Error('Phone contact not found');
      }

      const userContactId = phoneContact.userPhone_userContactId;

      // Hard delete the user_contact record (like legacy)
      await queryRunner.manager
        .createQueryBuilder()
        .delete()
        .from('user_contact')
        .where('id = :userContactId', { userContactId })
        .execute();

      // Soft delete the phone
      await queryRunner.manager
        .createQueryBuilder()
        .update('user_phone')
        .set({
          isDeleted: true,
        })
        .where('id = :phoneId', { phoneId })
        .execute();

      try {
        await this.auditTrailService.writeEntry(queryRunner.manager, {
          modelType: 'common\\models\\UserPhone',
          foreignPk: { id: phoneId },
          userId: auditUserId,
          type: 'delete',
          data: null,
        });
      } catch (auditError) {
        console.error('Failed to write UserPhone audit entry:', auditError);
      }

      await queryRunner.commitTransaction();

      return {
        id: phoneId,
        type: 'phone',
        deleted: true,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async update(customerId: number, locationId: number, phoneData: any, currentUserId: number): Promise<any> {
    const queryRunner = this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    queryRunner.data = {
      ...(queryRunner.data ?? {}),
      currentUserId,
    };
    await queryRunner.startTransaction();

    try {
      // If updating existing phone
      if (phoneData.id) {
        return await this.updateExistingPhone(queryRunner, customerId, locationId, phoneData);
      } else {
        // Creating new phone
        return await this.createNewPhone(queryRunner, customerId, locationId, phoneData);
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async updateExistingPhone(queryRunner: any, customerId: number, locationId: number, phoneData: any): Promise<any> {
    // Get existing phone with user contact
    const existingPhone = await queryRunner.manager
      .createQueryBuilder()
      .select('userPhone')
      .from('user_phone', 'userPhone')
      .leftJoinAndSelect('user_contact', 'userContact', 'userContact.id = userPhone.userContactId')
      .leftJoinAndSelect('user', 'user', 'user.id = userContact.userId')
      .leftJoin('user_location', 'userLocation', 'userLocation.user_id = user.id')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .where('userPhone.id = :phoneId', { phoneId: phoneData.id })
      .andWhere('user.id = :customerId', { customerId })
      .andWhere('userLocation.location_id = :locationId', { locationId })
      .andWhere('authAssignment.item_name = :role', { role: 'customer' })
      .andWhere('userPhone.isDeleted = false')
      .andWhere('user.isDeleted = false')
      .getRawOne();

    if (!existingPhone) {
      throw new Error('Phone not found or does not belong to this customer');
    }

    // Handle label
    let labelId = await this.getOrCreateLabel(queryRunner, phoneData.label, customerId);

    // Update user contact (label and primary status)
    const contactUpdateData: any = {};
    if (labelId !== undefined) contactUpdateData.labelId = labelId;
    if (phoneData.isPrimary !== undefined) contactUpdateData.isPrimary = phoneData.isPrimary ? 1 : 0;

    if (Object.keys(contactUpdateData).length > 0) {
      await queryRunner.manager
        .createQueryBuilder()
        .update('user_contact')
        .set(contactUpdateData)
        .where('id = :contactId', { contactId: existingPhone.userContact_id })
        .execute();
    }

    // Update phone
    const phoneUpdateData: any = {};
    if (phoneData.number) phoneUpdateData.number = phoneData.number;
    if (phoneData.extension !== undefined) phoneUpdateData.extension = phoneData.extension;
    if (phoneData.note !== undefined) phoneUpdateData.note = phoneData.note;

    if (Object.keys(phoneUpdateData).length > 0) {
      await queryRunner.manager
        .createQueryBuilder()
        .update('user_phone')
        .set(phoneUpdateData)
        .where('id = :phoneId', { phoneId: phoneData.id })
        .execute();
    }

    await queryRunner.commitTransaction();

    try {
      await this.auditTrailService.writeEntry(queryRunner.manager, {
        modelType: 'common\\models\\UserPhone',
        foreignPk: { id: phoneData.id },
        userId: ((queryRunner.data?.currentUserId as number | undefined) ?? 727),
        type: 'update',
        data: {
          before: {
            number: existingPhone.userPhone_number,
            extension: existingPhone.userPhone_extension,
            note: existingPhone.userPhone_note,
            labelId: existingPhone.userContact_labelId,
            isPrimary: existingPhone.userContact_isPrimary,
          },
          after: {
            number: phoneData.number || existingPhone.userPhone_number,
            extension: phoneData.extension !== undefined ? phoneData.extension : existingPhone.userPhone_extension,
            note: phoneData.note !== undefined ? phoneData.note : existingPhone.userPhone_note,
            labelId: labelId !== undefined ? labelId : existingPhone.userContact_labelId,
            isPrimary: phoneData.isPrimary !== undefined ? (phoneData.isPrimary ? 1 : 0) : existingPhone.userContact_isPrimary,
          },
        },
      });
    } catch (auditError) {
      console.error('Failed to write Customer UserPhone update audit entry:', auditError);
    }

    // Return updated phone data
    return await this.customersInfoRepository.getCustomerPhones(customerId, locationId);
  }

  private async createNewPhone(queryRunner: any, customerId: number, locationId: number, phoneData: any): Promise<any> {
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
    let labelId = await this.getOrCreateLabel(queryRunner, phoneData.label, customerId);

    // Create user contact
    const contactData = {
      userId: customerId,
      labelId: labelId || 3, // Default to "Other" if no label specified
      isPrimary: phoneData.isPrimary ? 1 : 0,
      isDeleted: false,
    };

    const contactResult = await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into('user_contact')
      .values(contactData)
      .execute();

    const contactId = contactResult.identifiers[0].id;

    // Create phone
    const phoneInsertData = {
      userContactId: contactId,
      number: phoneData.number,
      extension: phoneData.extension || null,
      note: phoneData.note || '',
      isDeleted: false,
    };

    await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into('user_phone')
      .values(phoneInsertData)
      .execute();

    await queryRunner.commitTransaction();

    // Return updated phone data
    return await this.customersInfoRepository.getCustomerPhones(customerId, locationId);
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
}
