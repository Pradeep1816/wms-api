import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';
import { InvoiceLineItemDiscount } from '../entities/invoice-line-item-discount.entity';
import { InvoicePayment } from '../entities/invoice-payment.entity';
import { InvoiceReverse } from '../entities/invoice-reverse.entity';
import { CustomerInfo, ReturnedInvoiceInfo } from '../dto/invoice-detail-response.dto';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';

export interface FirstLineItemActionMeta {
  itemTypeId: number | null;
  itemCategoryId: number | null;
}

@Injectable()
export class InvoiceDetailRepository {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem)
    private readonly lineItemRepository: Repository<InvoiceLineItem>,
    @InjectRepository(InvoicePayment)
    private readonly invoicePaymentRepository: Repository<InvoicePayment>,
  ) {}

  /**
   * Find a single invoice by ID and locationId
   * Mirrors legacy InvoiceController::findModel()
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
   * Get customer info (name, phone, email) for an invoice
   * Mirrors lesson-detail.repository → getStudentInfo pattern
   */
  async getCustomerInfo(userId: number): Promise<CustomerInfo | null> {
    const result = await this.invoiceRepository.manager
      .createQueryBuilder()
      .select('user.id', 'customerId')
      .addSelect(
        "COALESCE(CONCAT(profile.firstname, ' ', profile.lastname), user.username)",
        'customerName',
      )
      .addSelect('MAX(userPhone.number)', 'phoneNumber')
      .addSelect('MAX(primaryEmail.email)', 'email')
      .addSelect('MAX(authAssignment.item_name)', 'role')
      .from('user', 'user')
      .leftJoin('user_profile', 'profile', 'profile.user_id = user.id')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .leftJoin(
        'user_contact',
        'contact',
        'contact.userId = user.id AND contact.isDeleted = FALSE',
      )
      .leftJoin(
        'user_phone',
        'userPhone',
        'userPhone.userContactId = contact.id AND userPhone.isDeleted = FALSE',
      )
      .leftJoin(
        'user_contact',
        'primaryContact',
        'primaryContact.userId = user.id AND primaryContact.isDeleted = FALSE AND primaryContact.isPrimary = 1',
      )
      .leftJoin(
        'user_email',
        'primaryEmail',
        'primaryEmail.userContactId = primaryContact.id AND primaryEmail.isDeleted = FALSE',
      )
      .where('user.id = :userId', { userId })
      .groupBy('user.id')
      .getRawOne();

    return result || null;
  }

  /**
   * Fetch all non-deleted line items for an invoice
   * Mirrors legacy: InvoiceLineItem::find()->notDeleted()->andWhere(['invoice_id' => $id])
   * Supports optional sorting by allowed fields
   */
  async findLineItemsByInvoiceId(
    invoiceId: number,
    sortField?: string,
    sortOrder?: 'ASC' | 'DESC',
  ): Promise<InvoiceLineItem[]> {
    const qb = this.invoiceRepository.manager
      .createQueryBuilder(InvoiceLineItem, 'li')
      .where('li.invoiceId = :invoiceId', { invoiceId })
      .andWhere('li.isDeleted = :isDeleted', { isDeleted: false });

    // Map of allowed sort fields to their database column names
    const sortFieldMap: Record<string, string> = {
      royaltyFree: 'li.royaltyFree',
      taxStatus: 'li.taxStatus',
    };

    // Apply sorting if valid field is provided
    if (sortField && sortOrder && sortFieldMap[sortField]) {
      qb.orderBy(sortFieldMap[sortField], sortOrder);
    }

    return qb.getMany();
  }

  /**
   * Fetch discounts for a list of line item IDs
   */
  async findDiscountsByLineItemIds(
    lineItemIds: number[],
  ): Promise<InvoiceLineItemDiscount[]> {
    if (lineItemIds.length === 0) return [];

    return this.invoiceRepository.manager
      .createQueryBuilder(InvoiceLineItemDiscount, 'discount')
      .where('discount.invoiceLineItemId IN (:...ids)', { ids: lineItemIds })
      .getMany();
  }

  /**
   * Get all line items with discounts for an invoice
   * Used for totals calculation
   */
  async getLineItemsWithDiscounts(invoiceId: number): Promise<InvoiceLineItem[]> {
    return this.lineItemRepository
      .createQueryBuilder('lineItem')
      .leftJoinAndSelect('lineItem.discounts', 'discount')
      .leftJoinAndSelect('lineItem.item', 'item')
      .where('lineItem.invoiceId = :invoiceId', { invoiceId })
      .andWhere('lineItem.isDeleted = :isDeleted', { isDeleted: false })
      .orderBy('lineItem.id', 'ASC')
      .addOrderBy('discount.type', 'ASC')
      .getMany();
  }

  /**
   * Get total paid amount for an invoice
   * Sum of all non-deleted invoice payments linked to non-deleted payments
   */
  async getInvoicePaidAmount(invoiceId: number): Promise<number> {
    const result = await this.invoicePaymentRepository
      .createQueryBuilder('invoicePayment')
      .select('COALESCE(SUM(invoicePayment.amount), 0)', 'paid')
      .innerJoin('invoicePayment.payment', 'payment')
      .where('invoicePayment.invoiceId = :invoiceId', { invoiceId })
      .andWhere('invoicePayment.isDeleted = :isDeleted', { isDeleted: 0 })
      .andWhere('payment.isDeleted = :paymentDeleted', { paymentDeleted: 0 })
      .getRawOne();

    return parseFloat(result?.paid || '0');
  }

  /**
   * Get applied payments for pro-forma invoice
   * Excludes credit-used payments
   */
  async getInvoiceAppliedPayments(invoiceId: number): Promise<number> {
    const result = await this.invoicePaymentRepository
      .createQueryBuilder('invoicePayment')
      .select('COALESCE(SUM(invoicePayment.amount), 0)', 'applied')
      .innerJoin('invoicePayment.payment', 'payment')
      .where('invoicePayment.invoiceId = :invoiceId', { invoiceId })
      .andWhere('invoicePayment.isDeleted = :isDeleted', { isDeleted: 0 })
      .andWhere('payment.isDeleted = :paymentDeleted', { paymentDeleted: 0 })
      .andWhere('payment.paymentMethodId != :creditUsedMethodId', {
        creditUsedMethodId: PaymentMethod.TYPE_CREDIT_USED,
      })
      .getRawOne();

    return parseFloat(result?.applied || '0');
  }

  /**
   * Get credit-used payments for pro-forma invoice
   * Only credit-used payments
   */
  async getInvoiceCreditUsedPayments(invoiceId: number): Promise<number> {
    const result = await this.invoicePaymentRepository
      .createQueryBuilder('invoicePayment')
      .select('COALESCE(SUM(invoicePayment.amount), 0)', 'creditUsed')
      .innerJoin('invoicePayment.payment', 'payment')
      .where('invoicePayment.invoiceId = :invoiceId', { invoiceId })
      .andWhere('invoicePayment.isDeleted = :isDeleted', { isDeleted: 0 })
      .andWhere('payment.isDeleted = :paymentDeleted', { paymentDeleted: 0 })
      .andWhere('payment.paymentMethodId = :creditUsedMethodId', {
        creditUsedMethodId: PaymentMethod.TYPE_CREDIT_USED,
      })
      .getRawOne();

    return parseFloat(result?.creditUsed || '0');
  }
 

  /**
   * Get available customers for assignment to invoice
   * Excludes current customer if already assigned
   * Returns only active customers in the location with role 'customer'
   * Excludes location walk-in placeholder users
   * 
   * @param locationId - Location ID for scoping
   * @param excludeCustomerId - Current customer ID to exclude (nullable)
   * @param page - Page number for pagination
   * @param limit - Items per page
   * @param search - Search term for firstname, lastname, email, or student name
   * @param showAll - If true, show all customers; if false, show only owing customers
   * @returns Object with customers array and total count
   */
  async getAvailableCustomers(
    locationId: number,
    excludeCustomerId: number | null,
    page: number = 1,
    limit: number = 20,
    search?: string,
    showAll: boolean = false,
    sort: string = 'lastname',
    order: 'ASC' | 'DESC' = 'ASC',
  ): Promise<{ customers: any[]; total: number }> {
    const offset = (page - 1) * limit;

    // Auto-enable showAll when search is provided (legacy behavior)
    const effectiveShowAll = search?.trim() ? true : showAll;

    // Build base query with all necessary joins
    let query = this.invoiceRepository.manager
      .createQueryBuilder()
      .select('user.id', 'id')
      .addSelect('profile.firstname', 'firstName')
      .addSelect('profile.lastname', 'lastName')
      .addSelect('MAX(primaryEmail.email)', 'email')
      .addSelect('COALESCE(account.balance, 0)', 'balance')
      .addSelect(
        "GROUP_CONCAT(DISTINCT CONCAT(student.first_name, ' ', student.last_name) SEPARATOR ', ')",
        'students',
      )
      .from('user', 'user')
      .leftJoin('user_profile', 'profile', 'profile.user_id = user.id')
      .leftJoin('user_contact', 'contact', 'contact.userId = user.id AND contact.isDeleted = 0')
      .leftJoin('user_email', 'email', 'email.userContactId = contact.id AND email.isDeleted = 0')
      .leftJoin('user_contact', 'primaryContact', 'primaryContact.userId = user.id AND primaryContact.isDeleted = 0 AND primaryContact.isPrimary = 1')
      .leftJoin('user_email', 'primaryEmail', 'primaryEmail.userContactId = primaryContact.id AND primaryEmail.isDeleted = 0')
      .leftJoin('student', 'student', 'student.customer_id = user.id AND student.isDeleted = 0')
      .leftJoin('customer_account', 'account', 'account.customerId = user.id')
      .leftJoin('user_location', 'userLocation', 'userLocation.user_id = user.id')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .leftJoin('location_walkin_customer', 'walkin', 'walkin.customerId = user.id')
      .where('authAssignment.item_name = :role', { role: 'customer' })
      .andWhere('user.isDeleted = 0')
      .andWhere('user.status = :active', { active: 2 }) // Active customers only
      .andWhere('userLocation.location_id = :locationId', { locationId })
      .andWhere('walkin.id IS NULL'); // Exclude walk-in placeholder users

    // DO NOT exclude current customer - legacy shows it in the list

    // Apply search filter (by name, email, or student name)
    if (search?.trim()) {
      const searchTerm = `%${search.trim()}%`;
      query = query.andWhere(
        '(profile.firstname LIKE :search OR profile.lastname LIKE :search OR email.email LIKE :search OR student.first_name LIKE :search OR student.last_name LIKE :search OR CONCAT(student.first_name, " ", student.last_name) LIKE :search)',
        { search: searchTerm },
      );
    }

    // Default: only owing customers (active + inactive with non-zero balance)
    // When search is provided or showAll is true, show all customers
    if (!effectiveShowAll) {
      query = query.andWhere(
        '(user.status = :active OR (user.status = :notActive AND account.balance != 0))',
        { active: 2, notActive: 1 },
      );
    }

    // Group by user ID
    query = query.groupBy('user.id');

    // Get total count before pagination
    const countQuery = query.clone();
    const totalResult = await countQuery.getRawMany();
    const total = totalResult.length;

    // Map sort field to database column
    const sortColumnMap: Record<string, string> = {
      firstname: 'profile.firstname',
      lastname: 'profile.lastname',
      email: 'MAX(email.email)',
    };

    const sortColumn = sortColumnMap[sort] || 'profile.lastname'; // Fallback to lastname if invalid

    // Apply sorting and pagination
    const customers = await query
      .orderBy(sortColumn, order)
      .limit(limit)
      .offset(offset)
      .getRawMany();

    return { customers, total };
  }

  /**
   * Validate that a customer exists in the specified location
   * 
   * @param customerId - Customer user ID
   * @param locationId - Location ID
   * @returns true if customer exists in location, false otherwise
   */
  async validateCustomerInLocation(
    customerId: number,
    locationId: number,
  ): Promise<boolean> {
    const result = await this.invoiceRepository.manager
      .createQueryBuilder()
      .select('1')
      .from('user_location', 'userLocation')
      .where('userLocation.user_id = :customerId', { customerId })
      .andWhere('userLocation.location_id = :locationId', { locationId })
      .getRawOne();

    return !!result;
  }

  /**
   * Check if a user is a location walkin placeholder customer.
   * Each location has a default "Walkin Customer" user that is not a real customer.
   */
  async isLocationWalkinCustomer(
    userId: number,
    locationId: number,
  ): Promise<boolean> {
    const result = await this.invoiceRepository.manager
      .createQueryBuilder()
      .select('lwc.id')
      .from('location_walkin_customer', 'lwc')
      .where('lwc.customerId = :userId', { userId })
      .andWhere('lwc.locationId = :locationId', { locationId })
      .getRawOne();

    return !!result;
  }

  /**
   * Check if this invoice is itself a reversed (credit) invoice.
   * Matches legacy isReversedInvoice() — checks invoice_reverse.reversedInvoiceId = invoiceId
   */
  async isReversedInvoice(invoiceId: number): Promise<boolean> {
    const count = await this.invoiceRepository.manager
      .createQueryBuilder(InvoiceReverse, 'ir')
      .where('ir.reversedInvoiceId = :invoiceId', { invoiceId })
      .getCount();
    return count > 0;
  }

  /**
   * Check if this invoice has already been reversed by another invoice.
   * Matches legacy isInvoiceReversed() — checks invoice_reverse.invoiceId = invoiceId
   */
  async isInvoiceReversed(invoiceId: number): Promise<boolean> {
    const count = await this.invoiceRepository.manager
      .createQueryBuilder(InvoiceReverse, 'ir')
      .where('ir.invoiceId = :invoiceId', { invoiceId })
      .getCount();
    return count > 0;
  }

  /**
   * Get the returned (credit) invoice info if this invoice was returned.
   * Returns the credit invoice id and number.
   */
  async getReturnedInvoiceInfo(invoiceId: number): Promise<ReturnedInvoiceInfo | null> {
    const result = await this.invoiceRepository.manager
      .createQueryBuilder(InvoiceReverse, 'ir')
      .innerJoin(Invoice, 'creditInvoice', 'creditInvoice.id = ir.reversedInvoiceId')
      .select('creditInvoice.id', 'id')
      .addSelect('creditInvoice.invoice_number', 'invoiceNumber')
      .where('ir.invoiceId = :invoiceId', { invoiceId })
      .orderBy('ir.id', 'DESC')
      .getRawOne();

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      number: `I-${String(result.invoiceNumber).padStart(5, '0')}`,
    };
  }

  /**
   * Get the first non-deleted line item's item_type_id for canRevert checks.
   * Used to check isOpeningBalance() and isPaymentCreditInvoice().
   */
  async getFirstLineItemTypeId(invoiceId: number): Promise<number | null> {
    const lineItem = await this.invoiceRepository.manager
      .createQueryBuilder(InvoiceLineItem, 'ili')
      .select('ili.itemTypeId')
      .where('ili.invoiceId = :invoiceId', { invoiceId })
      .andWhere('ili.isDeleted = :isDeleted', { isDeleted: false })
      .orderBy('ili.id', 'ASC')
      .getOne();
    return lineItem?.itemTypeId ?? null;
  }

  /**
   * Get first non-deleted line item action metadata.
   * Used to compute invoice item action flags (add/edit tax).
   */
  async getFirstLineItemActionMeta(
    invoiceId: number,
  ): Promise<FirstLineItemActionMeta | null> {
    const row = await this.invoiceRepository.manager
      .createQueryBuilder(InvoiceLineItem, 'ili')
      .leftJoin('ili.item', 'item')
      .select('ili.itemTypeId', 'itemTypeId')
      .addSelect('item.itemCategoryId', 'itemCategoryId')
      .where('ili.invoiceId = :invoiceId', { invoiceId })
      .andWhere('ili.isDeleted = :isDeleted', { isDeleted: false })
      .orderBy('ili.id', 'ASC')
      .getRawOne();

    if (!row) {
      return null;
    }

    return {
      itemTypeId: row.itemTypeId !== null ? Number(row.itemTypeId) : null,
      itemCategoryId: row.itemCategoryId !== null ? Number(row.itemCategoryId) : null,
    };
  }

  /**
   * Check if invoice has at least one non-deleted line item.
   */
  async hasLineItems(invoiceId: number): Promise<boolean> {
    const count = await this.invoiceRepository.manager
      .createQueryBuilder(InvoiceLineItem, 'ili')
      .where('ili.invoiceId = :invoiceId', { invoiceId })
      .andWhere('ili.isDeleted = :isDeleted', { isDeleted: false })
      .getCount();
    return count > 0;
  }
}
