import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEmail } from '../../user/entities/user-email.entity';
import { UserContact } from '../../user/entities/user-contact.entity';
import { User } from '../../user/entities/user.entity';
import { CustomersInfoRepository } from './customers-info.repository';
import { AuditTrailService } from '../../audit-trail/services/audit-trail.service';

@Injectable()
export class CustomersInfoEmailRepository {
  constructor(
    @InjectRepository(UserEmail)
    private readonly userEmailRepository: Repository<UserEmail>,
    @InjectRepository(UserContact)
    private readonly userContactRepository: Repository<UserContact>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly customersInfoRepository: CustomersInfoRepository,
    private readonly auditTrailService: AuditTrailService,
  ) {}

  /**
   * Create customer email
   * Based on legacy actionCreateEmail functionality
   */
  async create(customerId: number, locationId: number, emailData: any, currentUserId: number): Promise<any> {
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
      let labelId = await this.getOrCreateLabel(queryRunner, emailData.label, customerId);

      // Create user contact
      const contactData = {
        userId: customerId,
        labelId: labelId || 3, // Default to "Other" if no label specified
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

      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into('user_email')
        .values(emailInsertData)
        .execute();

      await queryRunner.commitTransaction();

      // Return updated email data
      return await this.customersInfoRepository.getCustomerEmails(customerId, locationId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Update customer email
   * Based on legacy actionEditEmail functionality
   */
  async delete(
    customerId: number,
    locationId: number,
    emailId: string,
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

      // Find the email contact to delete
      const emailContact = await queryRunner.manager
        .createQueryBuilder()
        .select(['userEmail.id', 'userEmail.userContactId', 'userContact.isPrimary'])
        .from('user_email', 'userEmail')
        .leftJoin('user_contact', 'userContact', 'userContact.id = userEmail.userContactId')
        .where('userEmail.id = :emailId', { emailId })
        .andWhere('userContact.userId = :customerId', { customerId })
        .andWhere('userEmail.isDeleted = false')
        .getRawOne();

      if (!emailContact) {
        throw new Error('Email contact not found');
      }

      // Prevent deletion of primary email
      if (emailContact.userContact_isPrimary === 1 || emailContact.userContact_isPrimary === true) {
        throw new Error('Cannot delete primary email. Please set another email as primary first.');
      }

      const userContactId = emailContact.userEmail_userContactId;

      // Hard delete the user_contact record (like legacy)
      await queryRunner.manager
        .createQueryBuilder()
        .delete()
        .from('user_contact')
        .where('id = :userContactId', { userContactId })
        .execute();

      // Soft delete the email
      await queryRunner.manager
        .createQueryBuilder()
        .update('user_email')
        .set({
          isDeleted: true,
        })
        .where('id = :emailId', { emailId })
        .execute();

      try {
        await this.auditTrailService.writeEntry(queryRunner.manager, {
          modelType: 'common\\models\\UserEmail',
          foreignPk: { id: emailId },
          userId: auditUserId,
          type: 'delete',
          data: null,
        });
      } catch (auditError) {
        console.error('Failed to write UserEmail audit entry:', auditError);
      }

      await queryRunner.commitTransaction();

      return {
        id: emailId,
        type: 'email',
        deleted: true,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async update(customerId: number, locationId: number, emailData: any, currentUserId: number): Promise<any> {
    const queryRunner = this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    queryRunner.data = {
      ...(queryRunner.data ?? {}),
      currentUserId,
    };
    await queryRunner.startTransaction();

    try {
      // If updating existing email
      if (emailData.id) {
        return await this.updateExistingEmail(queryRunner, customerId, locationId, emailData);
      } else {
        // Creating new email
        return await this.createNewEmail(queryRunner, customerId, locationId, emailData);
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
    customerId: number,
    locationId: number,
    emailData: any,
  ): Promise<any> {
    // Get existing email with user contact
    const existingEmail = await queryRunner.manager
      .createQueryBuilder()
      .select('userEmail')
      .from('user_email', 'userEmail')
      .leftJoinAndSelect('user_contact', 'userContact', 'userContact.id = userEmail.userContactId')
      .leftJoinAndSelect('user', 'user', 'user.id = userContact.userId')
      .leftJoin('user_location', 'userLocation', 'userLocation.user_id = user.id')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .where('userEmail.id = :emailId', { emailId: emailData.id })
      .andWhere('user.id = :customerId', { customerId })
      .andWhere('userLocation.location_id = :locationId', { locationId })
      .andWhere('authAssignment.item_name = :role', { role: 'customer' })
      .andWhere('userEmail.isDeleted = false')
      .andWhere('user.isDeleted = false')
      .getRawOne();

    if (!existingEmail) {
      throw new Error('Email not found or does not belong to this customer');
    }

    // Handle label
    let labelId = await this.getOrCreateLabel(queryRunner, emailData.label, customerId);

    // Update user contact (label and primary status)
    const contactUpdateData: any = {};
    if (labelId !== undefined) contactUpdateData.labelId = labelId;
    if (emailData.isPrimary !== undefined) contactUpdateData.isPrimary = emailData.isPrimary ? 1 : 0;

    if (Object.keys(contactUpdateData).length > 0) {
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

    if (Object.keys(emailUpdateData).length > 0) {
      await queryRunner.manager
        .createQueryBuilder()
        .update('user_email')
        .set(emailUpdateData)
        .where('id = :emailId', { emailId: emailData.id })
        .execute();
    }

    await queryRunner.commitTransaction();

    try {
      await this.auditTrailService.writeEntry(queryRunner.manager, {
        modelType: 'common\\models\\UserEmail',
        foreignPk: { id: emailData.id },
        userId: ((queryRunner.data?.currentUserId as number | undefined) ?? 727),
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
      console.error('Failed to write Customer UserEmail update audit entry:', auditError);
    }

    // Return updated email data
    return await this.customersInfoRepository.getCustomerEmails(customerId, locationId);
  }

  private async createNewEmail(
    queryRunner: any,
    customerId: number,
    locationId: number,
    emailData: any,
  ): Promise<any> {
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
    let labelId = await this.getOrCreateLabel(queryRunner, emailData.label, customerId);

    // Create user contact
    const contactData = {
      userId: customerId,
      labelId: labelId || 3, // Default to "Other" if no label specified
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

    await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into('user_email')
      .values(emailInsertData)
      .execute();

    await queryRunner.commitTransaction();

    // Return updated email data
    return await this.customersInfoRepository.getCustomerEmails(customerId, locationId);
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
