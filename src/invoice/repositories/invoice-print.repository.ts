import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';
import { InvoicePayment } from '../entities/invoice-payment.entity';
import { InvoiceType } from '../enums/invoice-type.enum';

/**
 * Repository for Invoice Print operations
 * Handles all database queries for invoice printing
 */
@Injectable()
export class InvoicePrintRepository {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem)
    private readonly lineItemRepository: Repository<InvoiceLineItem>,
    @InjectRepository(InvoicePayment)
    private readonly invoicePaymentRepository: Repository<InvoicePayment>,
  ) {}

  /**
   * Find invoice by ID and location
   */
  async findInvoiceById(
    locationId: number,
    invoiceId: number,
  ): Promise<Invoice | null> {
    return this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.user', 'user')
      .where('invoice.id = :invoiceId', { invoiceId })
      .andWhere('invoice.locationId = :locationId', { locationId })
      .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
      .getOne();
  }

  /**
   * Get location data with city and province
   */
  async getLocationData(locationId: number): Promise<any> {
    return this.invoiceRepository.manager
      .createQueryBuilder()
      .select('location.name', 'name')
      .addSelect('location.address', 'address')
      .addSelect('location.postal_code', 'postalCode')
      .addSelect('location.phone_number', 'phone')
      .addSelect('location.email', 'email')
      .addSelect('location.hst_registration_no', 'hstRegistrationNo')
      .addSelect('city.name', 'city')
      .addSelect('province.name', 'province')
      .from('location', 'location')
      .leftJoin('city', 'city', 'city.id = location.city_id')
      .leftJoin('province', 'province', 'province.id = location.province_id')
      .where('location.id = :locationId', { locationId })
      .getRawOne();
  }

  /**
   * Get customer data with primary address, phone, and email
   * Phone can be from any contact (not just primary), using MAX to get one
   */
  async getCustomerData(userId: number): Promise<any> {
    return this.invoiceRepository.manager
      .createQueryBuilder()
      .select('user.id', 'id')
      .addSelect(
        "COALESCE(CONCAT(profile.firstname, ' ', profile.lastname), user.username)",
        'name',
      )
      .addSelect('primaryAddress.address', 'address')
      .addSelect('primaryCity.name', 'city')
      .addSelect('primaryProvince.name', 'province')
      .addSelect('primaryAddress.postalCode', 'postalCode')
      .addSelect('MAX(userPhone.number)', 'phone')
      .addSelect('MAX(primaryEmail.email)', 'email')
      .from('user', 'user')
      .leftJoin('user_profile', 'profile', 'profile.user_id = user.id')
      .leftJoin(
        'user_contact',
        'primaryContact',
        'primaryContact.userId = user.id AND primaryContact.isDeleted = FALSE AND primaryContact.isPrimary = 1',
      )
      .leftJoin(
        'user_address',
        'primaryAddress',
        'primaryAddress.userContactId = primaryContact.id AND primaryAddress.isDeleted = FALSE',
      )
      .leftJoin('city', 'primaryCity', 'primaryCity.id = primaryAddress.cityId')
      .leftJoin('province', 'primaryProvince', 'primaryProvince.id = primaryAddress.provinceId')
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
        'user_email',
        'primaryEmail',
        'primaryEmail.userContactId = primaryContact.id AND primaryEmail.isDeleted = FALSE',
      )
      .where('user.id = :userId', { userId })
      .groupBy('user.id')
      .getRawOne();
  }

  /**
   * Get line items for invoice
   */
  async getLineItems(invoiceId: number): Promise<InvoiceLineItem[]> {
    return this.lineItemRepository
      .createQueryBuilder('li')
      .leftJoinAndSelect('li.item', 'item')
      .where('li.invoiceId = :invoiceId', { invoiceId })
      .andWhere('li.isDeleted = :isDeleted', { isDeleted: false })
      .orderBy('li.id', 'ASC')
      .getMany();
  }

  /**
   * Get total discount for a line item
   */
  async getLineItemDiscountTotal(lineItemId: number): Promise<number> {
    const result = await this.lineItemRepository.manager
      .createQueryBuilder()
      .select('COALESCE(SUM(discount.value), 0)', 'totalDiscount')
      .from('invoice_line_item_discount', 'discount')
      .where('discount.invoiceLineItemId = :lineItemId', { lineItemId })
      .getRawOne();

    return Number(result?.totalDiscount || 0);
  }

  /**
   * Get payments for invoice
   * For Pro-Forma invoices, excludes credit-used payments
   */
  async getPayments(
    invoiceId: number,
    invoiceType: number,
  ): Promise<any[]> {
    let query = this.invoicePaymentRepository
      .createQueryBuilder('ip')
      .select('payment.date', 'date')
      .addSelect('paymentMethod.name', 'type')
      .addSelect('payment.reference', 'reference')
      .addSelect('payment.notes', 'notes')
      .addSelect('ip.amount', 'amount')
      .innerJoin('ip.payment', 'payment')
      .innerJoin('payment.paymentMethod', 'paymentMethod')
      .where('ip.invoiceId = :invoiceId', { invoiceId })
      .andWhere('ip.isDeleted = :isDeleted', { isDeleted: 0 })
      .andWhere('payment.isDeleted = :paymentDeleted', { paymentDeleted: 0 })
      .orderBy('payment.date', 'DESC');

    // For pro-forma invoices, exclude credit-used payments (matches legacy)
    if (invoiceType === InvoiceType.PRO_FORMA_INVOICE) {
      query = query.andWhere('payment.paymentMethodId != :creditUsedMethodId', {
        creditUsedMethodId: 6, // PaymentMethod.TYPE_CREDIT_USED
      });
    }

    return query.getRawMany();
  }

  /**
   * Get total paid amount for invoice
   */
  async getInvoicePaidAmount(invoiceId: number): Promise<number> {
    const result = await this.invoicePaymentRepository
      .createQueryBuilder('ip')
      .select('COALESCE(SUM(ip.amount), 0)', 'paid')
      .innerJoin('ip.payment', 'payment')
      .where('ip.invoiceId = :invoiceId', { invoiceId })
      .andWhere('ip.isDeleted = :isDeleted', { isDeleted: 0 })
      .andWhere('payment.isDeleted = :paymentDeleted', { paymentDeleted: 0 })
      .getRawOne();

    return Number(result?.paid || 0);
  }

  /**
   * Get reminder notes from settings
   */
  async getReminderNotes(): Promise<string> {
    const result = await this.invoiceRepository.manager
      .createQueryBuilder()
      .select('reminderNote.notes', 'notes')
      .from('reminder_note', 'reminderNote')
      .getRawOne();

    return result?.notes || '';
  }
}
