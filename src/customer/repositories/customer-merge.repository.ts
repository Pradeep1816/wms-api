import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { NoteInstanceType } from '../../comment/enums/comment.enum';
import { LogObjectType } from '../../log/enums/log-object-type.enum';

@Injectable()
export class MergeCustomersRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAllForMerge(
    locationId: number,
    excludeCustomerId: number,
    options: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      sort?: 'firstName' | 'lastName' | 'email' | 'phone';
      order?: 'asc' | 'desc';
    } = {},
  ): Promise<any[]> {
    const {
      firstName,
      lastName,
      email,
      phone,
      sort = 'lastName',
      order = 'asc',
    } = options;

    const query = this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.rbacAuthAssignment', 'rbacAuthAssignment')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.contacts', 'contact', 'contact.isDeleted = 0 AND contact.isPrimary = 1')
      .leftJoinAndSelect('contact.emails', 'emails', 'emails.isDeleted = 0')
      .leftJoinAndSelect('contact.phones', 'phones', 'phones.isDeleted = 0')
      .leftJoin('user.userLocation', 'userLocation')
      .leftJoin('user.locationWalkin', 'locationWalkin')
      .where('rbacAuthAssignment.item_name = :role', { role: 'customer' })
      .andWhere('user.isDeleted = 0')
      .andWhere('locationWalkin.customerId IS NULL')
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .andWhere('profile.firstname IS NOT NULL')
      .andWhere('profile.lastname IS NOT NULL')
      .andWhere('user.id != :excludeCustomerId', { excludeCustomerId });
    

    const filterCustomers = [
      { condition: firstName?.trim(), query: 'profile.firstname LIKE :firstName', params: { firstName: `%${firstName?.trim()}%` } },
      { condition: lastName?.trim(), query: 'profile.lastname LIKE :lastName', params: { lastName: `%${lastName?.trim()}%` } },
      { condition: email?.trim(), query: 'emails.email LIKE :email', params: { email: `%${email?.trim()}%` } },
      { condition: phone?.trim(), query: 'phones.number LIKE :phone', params: { phone: `%${phone?.trim()}%` } },
    ];

    filterCustomers.forEach(({ condition, query: queryString, params }) => {
      if (condition) {
        query.andWhere(queryString, params);
      }
    });

    const sortMapping = {
      firstName: 'profile.firstname',
      lastName: 'profile.lastname',
      email: 'emails.email',
      phone: 'phones.number',
    } as const;
    const sortField = sortMapping[sort] || 'profile.lastname';
    query.orderBy(sortField, (order || 'asc').toUpperCase() as 'ASC' | 'DESC');

    return await query.getMany();
  }

  /**
   * Merge a source customer into the target customer.
   * This operation:
   * 1. Validates that the source customer has no financial history (invoices, payments, payment requests)
   * 2. Transfers all students from source to target customer
   * 3. Transfers all notes from source to target customer
   * 4. Transfers all log history from source to target customer
   * 5. Soft deletes the source customer
   */
  async merge(
    targetCustomerId: number,
    sourceCustomerId: number,
    locationId: number,
  ): Promise<any> {
    const queryRunner = this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 1: Validate that both customers exist and belong to the location
      await this.validateCustomers(queryRunner, targetCustomerId, sourceCustomerId, locationId);

      // Step 2: Validate that the source customer has no financial history
      await this.validateNoFinancialHistory(queryRunner, sourceCustomerId);

      // Step 3: Transfer all students from source to target customer
      await this.transferStudents(queryRunner, targetCustomerId, sourceCustomerId);

      // Step 4: Transfer all notes from source to target customer
      await this.transferNotes(queryRunner, targetCustomerId, sourceCustomerId);

      // Step 5: Transfer all log history from source to target customer
      await this.transferLogHistory(queryRunner, targetCustomerId, sourceCustomerId);

      // Step 6: Soft delete the source customer
      await this.softDeleteCustomer(queryRunner, sourceCustomerId);

      await queryRunner.commitTransaction();

      return {
        targetCustomerId,
        sourceCustomerId,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Validates that both target and source customers exist and belong to the location
   */
  private async validateCustomers(
    queryRunner: QueryRunner,
    targetCustomerId: number,
    sourceCustomerId: number,
    locationId: number,
  ): Promise<void> {
    // Ensure target and source are different
    if (targetCustomerId === sourceCustomerId) {
      throw new BadRequestException('Target and source customer cannot be the same');
    }

    // Validate both customers in parallel
    const [targetCustomer, sourceCustomer] = await Promise.all([
      this.findCustomerById(queryRunner, targetCustomerId, locationId),
      this.findCustomerById(queryRunner, sourceCustomerId, locationId),
    ]);

    if (!targetCustomer) {
      throw new BadRequestException('Target customer not found or does not belong to this location');
    }

    if (!sourceCustomer) {
      throw new BadRequestException('Source customer not found or does not belong to this location');
    }
  }

  /**
   * Finds a customer by ID and validates they belong to the location
   */
  private async findCustomerById(
    queryRunner: QueryRunner,
    customerId: number,
    locationId: number,
  ): Promise<any> {
    return queryRunner.manager
      .createQueryBuilder()
      .select('user.id')
      .from('user', 'user')
      .innerJoin('rbac_auth_assignment', 'rbacAuthAssignment', 'rbacAuthAssignment.user_id = user.id')
      .innerJoin('user_location', 'userLocation', 'userLocation.user_id = user.id')
      .leftJoin('location_walkin_customer', 'locationWalkin', 'locationWalkin.customerId = user.id')
      .where('user.id = :customerId', { customerId })
      .andWhere('rbacAuthAssignment.item_name = :role', { role: 'customer' })
      .andWhere('user.isDeleted = 0')
      .andWhere('userLocation.location_id = :locationId', { locationId })
      .andWhere('locationWalkin.customerId IS NULL')
      .getRawOne();
  }

  /**
   * Validates that the source customer has no financial history (invoices, payments, payment requests)
   * Matches legacy behavior: checks all three and returns combined error message with customer publicIdentity
   */
  private async validateNoFinancialHistory(
    queryRunner: QueryRunner,
    sourceCustomerId: number,
  ): Promise<void> {
    // Get source customer's public identity for error message (matching legacy behavior)
    const sourceCustomer = await queryRunner.manager
      .createQueryBuilder(User, 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .where('user.id = :sourceCustomerId', { sourceCustomerId })
      .getOne();

    const getPublicIdentity = (): string => {
      if (sourceCustomer?.profile?.firstname && sourceCustomer?.profile?.lastname) {
        return `${sourceCustomer.profile.firstname} ${sourceCustomer.profile.lastname}`.trim();
      }
      return sourceCustomer?.username || 'this customer';
    };

    const publicIdentity = getPublicIdentity();

    // Check for invoices
    const invoiceCount = await queryRunner.manager
      .createQueryBuilder()
      .select('COUNT(*)', 'count')
      .from('invoice', 'invoice')
      .where('invoice.user_id = :userId', { userId: sourceCustomerId })
      .andWhere('invoice.isDeleted = 0')
      .getRawOne();

    // Check for payments
    const paymentCount = await queryRunner.manager
      .createQueryBuilder()
      .select('COUNT(*)', 'count')
      .from('payment', 'payment')
      .where('payment.user_id = :userId', { userId: sourceCustomerId })
      .andWhere('payment.isDeleted = 0')
      .getRawOne();

    // Check for payment requests (proforma invoices)
    const paymentRequestCount = await queryRunner.manager
      .createQueryBuilder()
      .select('COUNT(*)', 'count')
      .from('proforma_invoice', 'proforma_invoice')
      .where('proforma_invoice.userId = :userId', { userId: sourceCustomerId })
      .andWhere('proforma_invoice.isDeleted = 0')
      .getRawOne();

    // Match legacy behavior: combined check and error message format
    const hasInvoice = parseInt(invoiceCount?.count || '0', 10) > 0;
    const hasPayments = parseInt(paymentCount?.count || '0', 10) > 0;
    const hasPaymentRequests = parseInt(paymentRequestCount?.count || '0', 10) > 0;

    if (hasInvoice || hasPayments || hasPaymentRequests) {
      // Match legacy error message format exactly
      throw new BadRequestException(
        `Sorry! You can not merge ${publicIdentity} has payments/invoice/payment requests history.`,
      );
    }
  }

  /**
   * Transfers all students from source to target customer
   */
  private async transferStudents(
    queryRunner: QueryRunner,
    targetCustomerId: number,
    sourceCustomerId: number,
  ): Promise<number> {
    const result = await queryRunner.manager
      .createQueryBuilder()
      .update('student')
      .set({ customerId: targetCustomerId })
      .where('customer_id = :sourceCustomerId', { sourceCustomerId })
      .andWhere('isDeleted = 0')
      .execute();

    return result.affected || 0;
  }

  /**
   * Transfers all notes from source to target customer
   */
  private async transferNotes(
    queryRunner: QueryRunner,
    targetCustomerId: number,
    sourceCustomerId: number,
  ): Promise<number> {
    const result = await queryRunner.manager
      .createQueryBuilder()
      .update('note')
      .set({ instanceId: targetCustomerId })
      .where('instanceId = :sourceCustomerId', { sourceCustomerId })
      .andWhere('instanceType = :instanceType', { instanceType: NoteInstanceType.USER })
      .execute();

    return result.affected || 0;
  }

  /**
   * Transfers all log history from source to target customer
   */
  private async transferLogHistory(
    queryRunner: QueryRunner,
    targetCustomerId: number,
    sourceCustomerId: number,
  ): Promise<number> {
    const result = await queryRunner.manager
      .createQueryBuilder()
      .update('log_history')
      .set({ instanceId: targetCustomerId })
      .where('instanceId = :sourceCustomerId', { sourceCustomerId })
      .andWhere('instanceType = :instanceType', { instanceType: LogObjectType.USER })
      .execute();

    return result.affected || 0;
  }

  /**
   * Soft deletes the source customer
   */
  private async softDeleteCustomer(
    queryRunner: QueryRunner,
    sourceCustomerId: number,
  ): Promise<void> {
    await queryRunner.manager
      .createQueryBuilder()
      .update('user')
      .set({ isDeleted: true })
      .where('id = :sourceCustomerId', { sourceCustomerId })
      .execute();
  }
}
