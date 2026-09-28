import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEmail } from '../entities/user-email.entity';
import { UserContact } from '../entities/user-contact.entity';
import { User } from '../entities/user.entity';
import { getStandardLabelId } from '../enums/label.enum';
import { UserInfoTransformationService } from '../services/transformations/user-info-transformation.service';
import { AuditTrailService } from '../../audit-trail/services/audit-trail.service';

@Injectable()
export class UsersInfoEmailRepository {
  constructor(
    @InjectRepository(UserEmail)
    private readonly userEmailRepository: Repository<UserEmail>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly userInfoTransformationService: UserInfoTransformationService,
    private readonly auditTrailService: AuditTrailService,
  ) {}

  /**
   * Get user emails with contact information
   */
  async getUserEmails(
    userId: number,
    locationId: number,
    role?: string,
    isUser = false,
  ): Promise<any[]> {
    const query = this.userEmailRepository
    .createQueryBuilder('userEmail')
    .leftJoinAndSelect('userEmail.userContact', 'userContact')
    .leftJoinAndSelect('userContact.label', 'label')
    .leftJoinAndSelect('userContact.user', 'user')
    .leftJoinAndSelect('user.userLocation', 'userLocation')
    .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
    .where('user.id = :userId', { userId })
    .andWhere('authAssignment.item_name = :role', { role})
    .andWhere('userEmail.isDeleted = false')
    .andWhere('userContact.isDeleted = false')
    .andWhere('user.isDeleted = false')
    .orderBy('userContact.isPrimary', 'DESC') // Primary emails first
    .addOrderBy('userEmail.id', 'ASC');

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
    emailData: any,
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
      let labelId = await this.getOrCreateLabel(queryRunner, emailData.label, userId);

      // Create user contact
      const contactData = {
        userId: userId,
        labelId: labelId || UserContact.LABEL_OTHER, // Default to "Other" if no label specified
        isPrimary: emailData.isPrimary ? 1 : 0,
        isDeleted: false,
      };

      const contactResult = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into('user_contact')
        .values(contactData)
        .execute();

      const contactId = contactResult.identifiers[0].id;

      // Create email
      const emailInsertData = {
        userContactId: contactId,
        email: emailData.email,
        note: emailData.note || '',
        isDeleted: false,
      };

      const emailResult = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into('user_email')
        .values(emailInsertData)
        .execute();

      const emailId = emailResult.identifiers[0].id;

      await queryRunner.commitTransaction();

      // Return only the created email information
      return {
        id: emailId,
        email: emailData.email,
        label: emailData.label || null,
        isPrimary: emailData.isPrimary || false,
        note: emailData.note || '',
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
    emailData: any,
    currentUserId?: number,
  ): Promise<any> {
    const queryRunner = this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    if (currentUserId) {
      queryRunner.data.currentUserId = currentUserId;
    }

    try {
      // If updating existing email
      if (emailData.id) {
        return await this.updateExistingEmail(queryRunner, userId, locationId, role, isUser, emailData, currentUserId);
      } else {
        // Creating new email (fallback to create method)
        return await this.create(userId, locationId, role, isUser, emailData, currentUserId);
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async updateExistingEmail(
    queryRunner: any,
    userId: number,
    locationId: number,
    role: string,
    isUser: boolean,
    emailData: any,
    currentUserId?: number,
  ): Promise<any> {
    // Build query to get existing email with user contact
    const emailQuery = queryRunner.manager
      .createQueryBuilder()
      .select('userEmail')
      .from('user_email', 'userEmail')
      .leftJoinAndSelect('user_contact', 'userContact', 'userContact.id = userEmail.userContactId')
      .leftJoinAndSelect('user', 'user', 'user.id = userContact.userId')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .where('userEmail.id = :emailId', { emailId: emailData.id })
      .andWhere('user.id = :userId', { userId })
      .andWhere('authAssignment.item_name = :role', { role })
      .andWhere('userEmail.isDeleted = false')
      .andWhere('user.isDeleted = false');

    if (isUser) {
      emailQuery.leftJoin('user_location', 'userLocation', 'userLocation.user_id = user.id')
        .andWhere('userLocation.location_id = :locationId', { locationId });
    }

    const existingEmail = await emailQuery.getRawOne();

    if (!existingEmail) {
      throw new NotFoundException('Email not found or does not belong to this user');
    }

    // Handle label
    let labelId = await this.getOrCreateLabel(queryRunner, emailData.label, userId);

    // Update user contact (label and primary status)
    const contactUpdateData: any = {};
    if (labelId !== undefined) contactUpdateData.labelId = labelId;
    if (emailData.isPrimary !== undefined) contactUpdateData.isPrimary = emailData.isPrimary ? 1 : 0;
    const hasContactUpdate = Object.keys(contactUpdateData).length > 0;

    if (hasContactUpdate) {
      await queryRunner.manager
        .createQueryBuilder()
        .update('user_contact')
        .set(contactUpdateData)
        .where('id = :contactId', { contactId: existingEmail.userContact_id })
        .execute();
    }

    // Update email
    const emailUpdateData: any = {};
    if (emailData.email) emailUpdateData.email = emailData.email;
    if (emailData.note !== undefined) emailUpdateData.note = emailData.note;
    const hasEmailUpdate = Object.keys(emailUpdateData).length > 0;

    if (hasEmailUpdate) {
      await queryRunner.manager
        .createQueryBuilder()
        .update('user_email')
        .set(emailUpdateData)
        .where('id = :emailId', { emailId: emailData.id })
        .execute();
    }

    await queryRunner.commitTransaction();

    if (hasContactUpdate || hasEmailUpdate) {
      try {
        await this.auditTrailService.writeEntry(queryRunner.manager, {
          modelType: 'common\\models\\UserEmail',
          foreignPk: { id: emailData.id },
          userId: currentUserId ?? 727,
          type: 'update',
          data: {
            before: {
              email: existingEmail.userEmail_email,
              note: existingEmail.userEmail_note,
              labelId: existingEmail.userContact_labelId,
              isPrimary: existingEmail.userContact_isPrimary,
            },
            after: {
              email: emailData.email || existingEmail.userEmail_email,
              note: emailData.note !== undefined ? emailData.note : existingEmail.userEmail_note,
              labelId: labelId !== undefined ? labelId : existingEmail.userContact_labelId,
              isPrimary: emailData.isPrimary !== undefined ? (emailData.isPrimary ? 1 : 0) : existingEmail.userContact_isPrimary,
            },
          },
        });
      } catch (auditError) {
        console.error('Failed to write UserEmail update audit entry:', auditError);
      }
    }

    // Return only the updated email information
    return {
      id: emailData.id,
      email: emailData.email || existingEmail.userEmail_email,
      label: emailData.label || null,
      isPrimary: emailData.isPrimary !== undefined ? emailData.isPrimary : (existingEmail.userContact_isPrimary === 1),
      note: emailData.note !== undefined ? emailData.note : existingEmail.userEmail_note,
    };
  }

  async delete(
    userId: number,
    locationId: number,
    role: string,
    isUser: boolean,
    emailId: number,
    currentUserId?: number,
  ): Promise<any> {
    const queryRunner = this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    if (currentUserId) {
      queryRunner.data.currentUserId = currentUserId;
    }

    try {
      const emailQuery = queryRunner.manager
        .createQueryBuilder()
        .select('userEmail')
        .from('user_email', 'userEmail')
        .leftJoinAndSelect('user_contact', 'userContact', 'userContact.id = userEmail.userContactId')
        .leftJoinAndSelect('user', 'user', 'user.id = userContact.userId')
        .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
        .where('userEmail.id = :emailId', { emailId })
        .andWhere('user.id = :userId', { userId })
        .andWhere('authAssignment.item_name = :role', { role })
        .andWhere('userEmail.isDeleted = false')
        .andWhere('user.isDeleted = false');

      if (isUser) {
        emailQuery
          .leftJoin('user_location', 'userLocation', 'userLocation.user_id = user.id')
          .andWhere('userLocation.location_id = :locationId', { locationId });
      }

      const existingEmail = await emailQuery.getRawOne();

      if (!existingEmail) {
        throw new NotFoundException('Email not found or does not belong to this user');
      }

      const contactId = existingEmail.userContact_id;

      await queryRunner.manager
        .createQueryBuilder()
        .delete()
        .from('user_contact')
        .where('id = :contactId', { contactId })
        .execute();

      await queryRunner.manager
        .createQueryBuilder()
        .update('user_email')
        .set({ isDeleted: true })
        .where('id = :emailId', { emailId })
        .execute();

      try {
        await this.auditTrailService.writeEntry(queryRunner.manager, {
          modelType: 'common\\models\\UserEmail',
          foreignPk: { id: emailId },
          userId: ((queryRunner.data?.currentUserId as number | undefined) ?? currentUserId ?? 727),
          type: 'delete',
          data: null,
        });
      } catch (auditError) {
        console.error('Failed to write UserEmail delete audit entry:', auditError);
      }

      await queryRunner.commitTransaction();

      return{
        id: emailId,
        type: 'email',
        deleted: true,
      }
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
