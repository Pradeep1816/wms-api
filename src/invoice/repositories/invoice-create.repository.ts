import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { LocationWalkinCustomer } from '../../location/entities/location-walkin-customer.entity';
import { InvoiceStatus } from '../enums/invoice-status.enum';
import { getCurrentESTDate } from '../../utils/date-utils';

@Injectable()
export class InvoiceCreateRepository {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(LocationWalkinCustomer)
    private readonly walkinCustomerRepository: Repository<LocationWalkinCustomer>,
  ) {}

  /**
   * Get walk-in customer for a location
   */
  async getWalkinCustomer(locationId: number): Promise<number | null> {
    const walkinCustomer = await this.walkinCustomerRepository.findOne({
      where: { locationId },
    });
    return walkinCustomer?.customerId || null;
  }

  /**
   * Get next invoice number (scoped to location + type)
   */
  async getNextInvoiceNumber(
    locationId: number,
    type: number,
    manager: EntityManager,
  ): Promise<number> {
    // Serialize invoice numbering for creation paths using this repository.
    await manager.query('SELECT id FROM location WHERE id=? FOR UPDATE', [locationId]);
    const last = await manager
      .createQueryBuilder(Invoice, 'invoice')
      .where('invoice.location_id = :locationId', { locationId })
      .andWhere('invoice.type = :type', { type })
      // A locking read sees commits made after this transaction's first read.
      // The location lock alone does not refresh MySQL REPEATABLE READ snapshots.
      .setLock('pessimistic_write')
      .orderBy('invoice.id', 'DESC')
      .getOne();
    return last ? last.invoiceNumber + 1 : 1;
  }

  /**
   * Create transaction record (raw SQL - no entity)
   * Returns transaction ID
   */
  async createTransaction(
    userId: number,
    manager: EntityManager,
  ): Promise<number> {
    const transactionResult = await manager
      .createQueryBuilder()
      .insert()
      .into('transaction')
      .values({
        createdOn: getCurrentESTDate(),
        updatedOn: getCurrentESTDate(),
        createdByUserId: userId,
        updatedByUserId: userId,
      })
      .execute();

    // Handle different possible result structures (MySQL, PostgreSQL, etc.)
    const transactionId =
      transactionResult.identifiers?.[0]?.id ||
      transactionResult.raw?.insertId ||
      transactionResult.generatedMaps?.[0]?.id;

    if (!transactionId) {
      throw new Error('Could not get transaction ID from insert result');
    }

    return transactionId;
  }

  /**
   * Create blank invoice with all defaults
   */
  async createBlankInvoice(
    transactionId: number,
    userId: number,
    locationId: number,
    invoiceNumber: number,
    type: number,
    currentUserId: number,
    manager: EntityManager,
  ): Promise<Invoice> {
    const invoice = manager.create(Invoice, {
      transactionId,
      userId,
      locationId,
      invoiceNumber,
      date: getCurrentESTDate(),
      type,
      subTotal: 0,
      tax: 0,
      total: 0,
      balance: 0,
      status: InvoiceStatus.PAID, // Blank invoice = $0 = PAID
      isSent: false,
      isDeleted: false,
      isTaxAdjusted: 0,
      isCanceled: false,
      isPosted: 0,
      isVoid: 0,
      paidStatus: 0,
      totalCopy: 0,
      isEquipmentRentalContract: false,
      createdUserId: currentUserId,
      updatedUserId: currentUserId,
    });

    return manager.save(Invoice, invoice);
  }

  /**
   * Validate customer exists and belongs to location
   */
  async validateCustomer(
    customerId: number,
    locationId: number,
  ): Promise<boolean> {
    const count = await this.invoiceRepository.manager
      .createQueryBuilder()
      .select('1')
      .from('user', 'user')
      .innerJoin('user_location', 'ul', 'ul.user_id = user.id')
      .innerJoin('rbac_auth_assignment', 'role', "role.user_id = user.id AND role.item_name = 'customer'")
      .leftJoin('location_walkin_customer', 'walkin', 'walkin.customerId = user.id AND walkin.locationId = :locationId', { locationId })
      .where('user.id = :customerId', { customerId })
      .andWhere('ul.location_id = :locationId', { locationId })
      .andWhere('user.isDeleted = 0')
      .andWhere('(user.status = 2 OR walkin.customerId IS NOT NULL)')
      .getRawOne();

    return !!count;
  }
}
