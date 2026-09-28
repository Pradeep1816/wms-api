import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Not, Repository } from 'typeorm';
import { Payment } from '../entities/payment.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { PaymentFrequency } from '../entities/payment-frequency.entity';
import { User } from '../../user/entities/user.entity';
import { UserLocation } from '../../user/entities/user-location.entity';
import { PaymentMethodStatus, PaymentMethodType } from '../enums/payment-method-type.enum';

@Injectable()
export class PaymentQueryRepository {
  async getInvoiceBuyerName(paymentId: number): Promise<string | undefined> {
    const rows = await this.paymentRepository.manager.query(`SELECT DISTINCT i.walkinBuyerName AS name
      FROM invoice_payment ip INNER JOIN invoice i ON i.id=ip.invoice_id
      WHERE ip.payment_id=? AND ip.isDeleted=0 AND i.isDeleted=0 AND i.walkinBuyerName IS NOT NULL`, [paymentId]);
    return rows.length === 1 ? `${rows[0].name} (Walk-in Customer)` : undefined;
  }
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepository: Repository<PaymentMethod>,
    @InjectRepository(PaymentFrequency)
    private readonly paymentFrequencyRepository: Repository<PaymentFrequency>,
  ) {}

  /** Allowed sort fields for customer payments (whitelist for safety) */
  private static readonly CUSTOMER_PAYMENTS_ORDER_BY_WHITELIST = ['date', 'amount', 'id', 'balance'];

  /**
   * Get customer payments
   * @param customerId - The customer ID
   * @param locationId - The location ID
   * @param orderBy - Sort field (date, amount, id, balance). Default: date
   * @param order - Sort direction (ASC, DESC). Default: DESC
   * @returns Array of payment objects with essential data only
   */
  async getCustomerPayments(
    customerId: number,
    locationId: number,
    orderBy: string = 'date',
    order: 'ASC' | 'DESC' = 'DESC',
  ): Promise<any[]> {
    const sortField = PaymentQueryRepository.CUSTOMER_PAYMENTS_ORDER_BY_WHITELIST.includes(orderBy)
      ? orderBy
      : 'date';
    const sortDirection = order === 'ASC' ? 'ASC' : 'DESC';

    const payments = await this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoin('payment.user', 'user')
      .leftJoin('user.userLocation', 'userLocation')
      .where('payment.userId = :userId', { userId: customerId })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .andWhere('payment.isDeleted = false')
      .andWhere('payment.paymentMethodId NOT IN (:...excludedMethods)', {
        excludedMethods: [PaymentMethodType.CREDIT_USED, PaymentMethodType.CREDIT_APPLIED],
      })
      .orderBy(`payment.${sortField}`, sortDirection)
      .getMany();

    return payments.map(payment => ({
      id: payment.id,
      amount: payment.amount,
      date: payment.date,
      notes: payment.notes,
      balance: payment.balance,
    }));
  }


  /**
   * Get payment credits
   * @param customerId - The customer ID
   * @param page - The page number
   * @param limit - The limit
   * @returns Array of payment objects with essential data only
   */
  
  async getPaymentCredits(customerId: number, page: number = 1, limit: number = 10) {
    const [payments, total] = await this.paymentRepository.findAndCount({
      where: {
        userId: customerId,
        isDeleted: 0,
        balance: MoreThan(0.09),
        paymentMethodId: Not(In([PaymentMethodType.CREDIT_USED, PaymentMethodType.CREDIT_APPLIED])),
      },
      order: { id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { payments, total };
  }

  async getPaymentMethods() {
    const paymentMethods = await this.paymentMethodRepository.find({
      where: { active: PaymentMethodStatus.ACTIVE, displayed: 1},
      order: { sortOrder: 'ASC' },
    });
    return paymentMethods;
  }

  /**
   * Get all payment frequencies ordered by ID.
   */
  async getPaymentFrequencies(): Promise<PaymentFrequency[]> {
    return this.paymentFrequencyRepository.find({
      order: { id: 'ASC' },
    });
  }

  /**
   * Get payment by payment ID
   * Returns payment with all related data: user, profile, contacts, emails, payment method, user location
   */
  async getPaymentByPaymentId(paymentId: number, locationId: number): Promise<any> {
    // Get payment with user and payment method
    const payment = await this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.user', 'user')
      .leftJoinAndSelect('user.profile', 'userProfile')
      .leftJoinAndSelect('user.contacts', 'contacts')
      .leftJoinAndSelect('contacts.emails', 'emails')
      .leftJoinAndSelect('payment.paymentMethod', 'paymentMethod')
      .leftJoin('user.userLocation', 'userLocation')
      .where('payment.id = :paymentId', { paymentId })
      .andWhere('payment.isDeleted = false')
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .getOne();

    if (!payment) {
      return null;
    }

    return payment;
  }
}
