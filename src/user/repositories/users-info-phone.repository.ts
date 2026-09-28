import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPhone } from '../entities/user-phone.entity';
import { UserContact } from '../entities/user-contact.entity';
import { User } from '../entities/user.entity';
import { getStandardLabelId } from '../enums/label.enum';
import { UserInfoTransformationService } from '../services/transformations/user-info-transformation.service';
import { AuditTrailService } from '../../audit-trail/services/audit-trail.service';

@Injectable()
export class UsersInfoPhoneRepository {
  constructor(
    @InjectRepository(UserPhone)
    private readonly userPhoneRepository: Repository<UserPhone>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly userInfoTransformationService: UserInfoTransformationService,
    private readonly auditTrailService: AuditTrailService,
  ) {}

  /**
   * Get user phone numbers with contact information
   */
  async getUserPhones(
    userId: number,
    locationId: number,
    role?: string,
    isUser = false,
  ): Promise<any[]> {
    const query = this.userPhoneRepository
      .createQueryBuilder('userPhone')
      .leftJoinAndSelect('userPhone.contact', 'userContact')
      .leftJoinAndSelect('userContact.label', 'label')
      .leftJoinAndSelect('userContact.user', 'user')
      .leftJoinAndSelect('user.userLocation', 'userLocation')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .where('user.id = :userId', { userId })
      .andWhere('authAssignment.item_name = :role', { role})
      .andWhere('userPhone.isDeleted = false')
      .andWhere('userContact.isDeleted = false')
      .andWhere('user.isDeleted = false')
      .orderBy('userContact.isPrimary', 'DESC') // Primary phones first
      .addOrderBy('userPhone.id', 'ASC');
    // If user is a customer or teacher, enforce location
    if (isUser) {
      query.andWhere('userLocation.locationId = :locationId', { locationId });
    }

    return await query.getMany();
  }

  async create(
    userId: number,
    locationId: number,
    role: string,
    isUser: boolean,
    phoneData: any,
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
      let labelId = await this.getOrCreateLabel(queryRunner, phoneData.label, userId);

      // Create user contact
      const contactData = {
        userId: userId,
        labelId: labelId || UserContact.LABEL_OTHER, // Default to "Other" if no label specified
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

      const phoneResult = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into('user_phone')
        .values(phoneInsertData)
        .execute();

      const phoneId = phoneResult.identifiers[0].id;

      await queryRunner.commitTransaction();

      // Return only the created phone information
      return {
        id: phoneId,
        number: phoneData.number,
        extension: phoneData.extension || null,
        label: phoneData.label || null,
        isPrimary: phoneData.isPrimary || false,
        note: phoneData.note || '',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async update(
    userId: number,
    locationId: number,
    role: string,
    isUser: boolean,
    phoneData: any,
    currentUserId?: number,
  ): Promise<any> {
    const queryRunner = this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    if (currentUserId) {
      queryRunner.data.currentUserId = currentUserId;
    }

    try {
      // If updating existing phone
      if (phoneData.id) {
        return await this.updateExistingPhone(queryRunner, userId, locationId, role, isUser, phoneData, currentUserId);
      } else {
        // Creating new phone (fallback to create method)
        return await this.create(userId, locationId, role, isUser, phoneData, currentUserId);
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async updateExistingPhone(
    queryRunner: any,
    userId: number,
    locationId: number,
    role: string,
    isUser: boolean,
    phoneData: any,
    currentUserId?: number,
  ): Promise<any> {
    // Build query to get existing phone with user contact
    const phoneQuery = queryRunner.manager
      .createQueryBuilder()
      .select('userPhone')
      .from('user_phone', 'userPhone')
      .leftJoinAndSelect('user_contact', 'userContact', 'userContact.id = userPhone.userContactId')
      .leftJoinAndSelect('user', 'user', 'user.id = userContact.userId')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .where('userPhone.id = :phoneId', { phoneId: phoneData.id })
      .andWhere('user.id = :userId', { userId })
      .andWhere('authAssignment.item_name = :role', { role })
      .andWhere('userPhone.isDeleted = false')
      .andWhere('user.isDeleted = false');

    if (isUser) {
      phoneQuery.leftJoin('user_location', 'userLocation', 'userLocation.user_id = user.id')
        .andWhere('userLocation.location_id = :locationId', { locationId });
    }

    const existingPhone = await phoneQuery.getRawOne();

    if (!existingPhone) {
      throw new NotFoundException('Phone Number not found or does not belong to this user');
    }

    // Handle label
    let labelId = await this.getOrCreateLabel(queryRunner, phoneData.label, userId);

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
        userId: ((queryRunner.data?.currentUserId as number | undefined) ?? currentUserId ?? 727),
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
      console.error('Failed to write UserPhone update audit entry:', auditError);
    }

    // Return only the updated phone information
    return {
      id: phoneData.id,
      number: phoneData.number || existingPhone.userPhone_number,
      extension: phoneData.extension !== undefined ? phoneData.extension : existingPhone.userPhone_extension,
      label: phoneData.label || null,
      isPrimary: phoneData.isPrimary !== undefined ? phoneData.isPrimary : (existingPhone.userContact_isPrimary === 1),
      note: phoneData.note !== undefined ? phoneData.note : existingPhone.userPhone_note,
    };
  }

  async delete(
    userId: number,
    locationId: number,
    role: string,
    isUser: boolean,
    phoneId: number,
    currentUserId?: number,
  ): Promise<any> {
    const queryRunner = this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    if (currentUserId) {
      queryRunner.data.currentUserId = currentUserId;
    }

    try {
      const phoneQuery = queryRunner.manager
        .createQueryBuilder()
        .select('userPhone')
        .from('user_phone', 'userPhone')
        .leftJoinAndSelect('user_contact', 'userContact', 'userContact.id = userPhone.userContactId')
        .leftJoinAndSelect('user', 'user', 'user.id = userContact.userId')
        .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
        .where('userPhone.id = :phoneId', { phoneId })
        .andWhere('user.id = :userId', { userId })
        .andWhere('authAssignment.item_name = :role', { role })
        .andWhere('userPhone.isDeleted = false')
        .andWhere('user.isDeleted = false');

      if (isUser) {
        phoneQuery
          .leftJoin('user_location', 'userLocation', 'userLocation.user_id = user.id')
          .andWhere('userLocation.location_id = :locationId', { locationId });
      }

      const existingPhone = await phoneQuery.getRawOne();

      if (!existingPhone) {
        throw new NotFoundException('Phone Number not found or does not belong to this user');
      }

      const contactId = existingPhone.userContact_id;

      await queryRunner.manager
        .createQueryBuilder()
        .delete()
        .from('user_contact')
        .where('id = :contactId', { contactId })
        .execute();

      await queryRunner.manager
        .createQueryBuilder()
        .update('user_phone')
        .set({ isDeleted: true })
        .where('id = :phoneId', { phoneId })
        .execute();

      try {
        await this.auditTrailService.writeEntry(queryRunner.manager, {
          modelType: 'common\\models\\UserPhone',
          foreignPk: { id: phoneId },
          userId: ((queryRunner.data?.currentUserId as number | undefined) ?? currentUserId ?? 727),
          type: 'delete',
          data: null,
        });
      } catch (auditError) {
        console.error('Failed to write UserPhone delete audit entry:', auditError);
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
}
