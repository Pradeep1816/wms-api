import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';
import { User } from '../../user/entities/user.entity';

@Injectable()
export class InvoiceDetailEditRepository {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem)
    private readonly lineItemRepository: Repository<InvoiceLineItem>,
  ) {}

  /**
   * Find a single invoice by ID and locationId 
   */
  async findInvoiceById(
    locationId: number,
    invoiceId: number,
  ): Promise<Invoice | null> {
    return this.invoiceRepository
      .createQueryBuilder('invoice')
      .where('invoice.id = :invoiceId', { invoiceId })
      .andWhere('invoice.locationId = :locationId', { locationId })
      .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
      .getOne();
  }

  /**
   * Update the invoice date and metadata fields.
   *  - updatedOn is auto-handled by TypeORM @UpdateDateColumn
   *
   * @param invoice - The invoice entity to update
   * @param date - The new date value
   * @param userId - Current authenticated user ID (for audit)
   * @returns The updated invoice entity
   */
  async updateInvoiceDate(
    invoice: Invoice,
    date: Date,
    userId: number,
  ): Promise<Invoice> {
    invoice.date = date;
    invoice.updatedUserId = userId;
    return this.invoiceRepository.save(invoice);
  }

  /**
   * Assign a walk-in customer to an invoice
   * Updates the invoice's userId and audit fields
   * 
   * @param invoice - The invoice entity to update
   * @param customerId - The new walk-in customer's user ID
   * @param userId - Current authenticated user ID (for audit)
   * @param manager - Transaction entity manager
   * @returns The updated invoice entity
   */
  async assignWalkinToInvoice(
    invoice: Invoice,
    customerId: number,
    userId: number,
    manager: EntityManager,
  ): Promise<Invoice> {
    invoice.userId = customerId;
    invoice.updatedUserId = userId;
    return manager.save(Invoice, invoice);
  }

  /**
   * Get sum of tax_rate from all non-deleted line items for an invoice.
   */
  async getLineItemTaxSum(invoiceId: number): Promise<number> {
    const result = await this.lineItemRepository
      .createQueryBuilder('li')
      .select('COALESCE(SUM(li.taxRate), 0)', 'totalTax')
      .where('li.invoiceId = :invoiceId', { invoiceId })
      .andWhere('li.isDeleted = :isDeleted', { isDeleted: false })
      .getRawOne();

    return parseFloat(result?.totalTax) || 0;
  }

  /**
   * Get first non-deleted line item for the invoice (to check item type).
   */
  async getFirstLineItem(invoiceId: number): Promise<InvoiceLineItem | null> {
    return this.lineItemRepository
      .createQueryBuilder('li')
      .where('li.invoiceId = :invoiceId', { invoiceId })
      .andWhere('li.isDeleted = :isDeleted', { isDeleted: false })
      .getOne();
  }

  /**
   * Save adjusted tax values to the invoice.
   * Fields updated (matching legacy beforeSave):
   *   - tax: new tax value (after adjustment)
   *   - isTaxAdjusted: 1 if tax ≠ lineItemTax, 0 otherwise
   *   - total: subTotal + tax (recalculated)
   *   - status: recalculated from total vs paid
   *   - balance: recalculated from total vs paid
   *   - updatedUserId: audit trail
   *   - updatedOn: auto by TypeORM @UpdateDateColumn
   */
  async updateInvoiceTax(
    invoice: Invoice,
    newTax: number,
    isTaxAdjusted: boolean,
    newTotal: number,
    newBalance: number,
    newStatus: number,
    userId: number,
  ): Promise<Invoice> {
    invoice.tax = newTax;
    invoice.isTaxAdjusted = isTaxAdjusted ? 1 : 0;
    invoice.total = newTotal;
    invoice.balance = newBalance;
    invoice.status = newStatus;
    invoice.updatedUserId = userId;
    return this.invoiceRepository.save(invoice);
  }

  /**
   * Assign a customer to an invoice
   * Updates the invoice's userId and audit fields
   * 
   * @param invoice - The invoice entity to update
   * @param customerId - The new customer's user ID
   * @param userId - Current authenticated user ID (for audit)
   * @returns The updated invoice entity
   */
  async assignCustomerToInvoice(
    invoice: Invoice,
    customerId: number,
    userId: number,
  ): Promise<Invoice> {
    invoice.userId = customerId;
    invoice.updatedUserId = userId;
    return this.invoiceRepository.save(invoice);
  }

  /**
   * Get total paid amount for an invoice.
   */
  async getInvoicePaidAmount(invoiceId: number): Promise<number> {
    const result = await this.invoiceRepository.manager
      .createQueryBuilder()
      .select('COALESCE(SUM(ip.amount), 0)', 'totalPaid')
      .from('invoice_payment', 'ip')
      .innerJoin('payment', 'p', 'p.id = ip.payment_id AND p.isDeleted = 0')
      .where('ip.invoice_id = :invoiceId', { invoiceId })
      .andWhere('ip.isDeleted = 0')
      .getRawOne();

    return parseFloat(result?.totalPaid) || 0;
  }

  /**
   * Update all payments linked to an invoice to point to the new customer
   * This ensures data consistency when changing invoice customer
   * 
   * CRITICAL: This updates payment.user_id for ALL payments linked via invoice_payment junction
   * 
   * @param invoiceId - Invoice ID
   * @param newCustomerId - New customer's user ID
   * @param userId - Current authenticated user ID (for audit)
   * @returns Number of payments updated
   */
  async updatePaymentCustomers(
    invoiceId: number,
    newCustomerId: number,
    userId: number,
  ): Promise<number> {
    // Create subquery to get payment IDs linked to this invoice
    const subQuery = this.invoiceRepository.manager
      .createQueryBuilder()
      .select('invoice_payment.payment_id')
      .from('invoice_payment', 'invoice_payment')
      .where('invoice_payment.invoice_id = :invoiceId', { invoiceId })
      .andWhere('invoice_payment.isDeleted = 0')
      .getQuery();

    // Update payments using the subquery
    const result = await this.invoiceRepository.manager
      .createQueryBuilder()
      .update('payment')
      .set({
        userId: newCustomerId,
        updatedByUserId: userId,
      })
      .where(`payment.id IN (${subQuery})`)
      .andWhere('payment.isDeleted = 0')
      .setParameters({ invoiceId })
      .execute();

    return result.affected || 0;
  }

  
  /**
   * Create invoice message.
   * Used when notes is currently empty.
   */
  async createInvoiceMessage(
    invoice: Invoice,
    notes: string,
    userId: number,
  ): Promise<Invoice> {
    invoice.notes = notes;
    invoice.updatedUserId = userId;
    return this.invoiceRepository.save(invoice);
  }

  /**
   * Update invoice message.
   * Used when notes already exists (pencil/edit icon).
   * PHP equivalent: actionNote($id) → $model->load(post()) && $model->save()
   * Updates: invoice.notes, invoice.updatedUserId, invoice.updatedOn (auto)
   */
  async updateInvoiceMessage(
    invoice: Invoice,
    notes: string,
    userId: number,
  ): Promise<Invoice> {
    invoice.notes = notes;
    invoice.updatedUserId = userId;
    return this.invoiceRepository.save(invoice);
  }

  /**
   * Find user along with their primary contact and active emails.
   */
  async findUserWithContactsAndEmails(
    userId: number,
    manager: EntityManager,
  ): Promise<User | null> {
    return manager
      .createQueryBuilder(User, 'user')
      .leftJoinAndSelect('user.contacts', 'contact', 'contact.isPrimary = 1 AND contact.isDeleted = 0')
      .leftJoinAndSelect('contact.emails', 'email', 'email.isDeleted = 0')
      .where('user.id = :userId', { userId })
      .andWhere('user.isDeleted = 0')
      .getOne();
  }

  /**
   * Update the firstname and lastname directly on the user_profile table.
   */
  async updateUserProfileNames(
    userId: number,
    firstname: string,
    lastname: string,
    manager: EntityManager,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update('user_profile')
      .set({ firstname, lastname })
      .where('user_id = :userId', { userId })
      .execute();
  }

  /**
   * Update the explicit email string inside the user_email table.
   */
  async updateUserEmailAddress(
    emailId: number,
    emailAddress: string,
    manager: EntityManager,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update('user_email')
      .set({ email: emailAddress })
      .where('id = :emailId', { emailId })
      .execute();
  }
}