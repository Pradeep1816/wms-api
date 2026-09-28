import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { Location } from '../../location/entities/location.entity';
import { User } from '../../user/entities/user.entity';
import { IOutstandingInvoiceQueryRepository } from '../interfaces/outstanding-invoice-repository.interface';
import { PaymentMethod } from 'src/payment/entities/payment-method.entity';

@Injectable()
export class OutstandingInvoiceRepository implements IOutstandingInvoiceQueryRepository {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}


  /**
   * Get outstanding invoices by customer ID with pagination
   * Outstanding invoices are those with balance > 0.09 and not canceled
   */
  async getOutstandingInvoicesByCustomerId(
    customerId: number,
    locationId: number,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ invoices: any[]; total: number; totalBalanceDue: number; paymentMap: Record<number, string> }> {
    const offset = (page - 1) * limit;

    const [invoices, total] = await this.invoiceRepository.findAndCount({
      where: {
        userId: customerId,
        locationId: locationId,
        balance: MoreThan(0.09), 
        isDeleted: false,
        isCanceled: false,
        type: Invoice.TYPE_INVOICE, // Only actual invoices, not pro-forma
      },
      relations: ['lineItems'],
      order: { createdOn: 'ASC' },
      skip: offset,
      take: limit,
    });

    // Total balance across all outstanding invoices.
    // Must use the same filters as the list above, or the total reports an amount
    // owing for invoices the customer cannot see (canceled/void are hidden from
    // every list, yet kept a non-zero balance).
    const totalBalanceDue = (
      await this.invoiceRepository.find({
        where: {
          userId: customerId,
          locationId: locationId,
          isDeleted: false,
          isCanceled: false,
          isVoid: 0,
          type: Invoice.TYPE_INVOICE,
          balance: MoreThan(0.09)
        },
        select: ['balance'],
      })
    ).reduce((sum, i) => sum + Number(i.balance || 0), 0);

    const invoiceIds = invoices.map((i) => i.id);

    // Get total payments grouped by invoiceId in one query
    let paymentMap = {};
    if (invoiceIds.length > 0) {
      const paymentResults = await this.invoiceRepository
        .createQueryBuilder('invoice')
        .leftJoin('invoice_payment', 'ip', 'ip.invoice_id = invoice.id')
        .leftJoin('payment', 'p', 'p.id = ip.payment_id')
        .where('invoice.id IN (:...invoiceIds)', { invoiceIds })
        .andWhere('ip.isDeleted = false')
        .andWhere('p.isDeleted = false')
        .select('invoice.id', 'invoiceId')
        .addSelect('SUM(ip.amount)', 'totalPaid')
        .groupBy('invoice.id')
        .getRawMany();
      
      paymentMap = Object.fromEntries(
        paymentResults.map((row) => [
          row.invoiceId,
          parseFloat(row.totalPaid || '0').toFixed(4),
        ]),
      );
    }

    return {
      invoices,
      total,
      totalBalanceDue,
      paymentMap,
    };
  }

  /**
   * Get available credits for a customer
   * - Invoice credits: invoices with negative balance (credit balances)
   * - Payment credits: payments with remaining positive balance, excluding auto-applied/used methods
   */
  async getAvailableCreditsData(userId: number, locationId: number): Promise<{ invoiceCredits: any[]; paymentCredits: any[] }> {
    // Invoice credits: balance <= -0.09, not deleted, type = invoice, with legacy date string
    const invoiceCredits = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .select('invoice.id', 'id')
      .addSelect('invoice.invoiceNumber', 'invoiceNumber')
      .addSelect("DATE_FORMAT(invoice.date, '%Y-%m-%d %H:%i:%s')", 'date')
      .addSelect('invoice.balance', 'balance')
      .where('invoice.userId = :userId', { userId })
      .andWhere('invoice.locationId = :locationId', { locationId })
      .andWhere('invoice.isDeleted = false')
      .andWhere('invoice.type = :type', { type: Invoice.TYPE_INVOICE })
      .andWhere('invoice.balance <= -0.09')
      .orderBy('invoice.id', 'ASC')
      .getRawMany();
  
    // Payment credits: balance > 0.09, exclude account entries (auto payments)
    const paymentCredits = await this.invoiceRepository.manager
      .createQueryBuilder()
      .select('p.id', 'id')
      .addSelect("DATE_FORMAT(p.date, '%Y-%m-%d %H:%i:%s')", 'date')
      .addSelect('p.reference', 'reference')
      .addSelect('p.balance', 'balance')
      .from('payment', 'p')
      .where('p.user_id = :userId', { userId })
      .andWhere('p.isDeleted = false')
      .andWhere('p.payment_method_id != :auto', { auto: PaymentMethod.TYPE_ACCOUNT_ENTRY })
      .andWhere('ROUND(p.balance, 2) > 0.09')
      .orderBy('p.id', 'ASC')
      .getRawMany();
  
    return { invoiceCredits, paymentCredits };
  }

  /**
   * Get invoices paid by a specific payment ID
   * Reusable query for payment view
   */
  async getInvoicesByPaymentId(
    paymentId: number,
    locationId: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ invoices: any[]; total: number }> {
    const offset = (page - 1) * limit;
    
    const baseQuery = () => this.invoiceRepository
      .createQueryBuilder('invoice')
      .innerJoin('invoice_payment', 'ip', 'ip.invoice_id = invoice.id AND ip.payment_id = :paymentId AND ip.isDeleted = 0', { paymentId })
      .where('invoice.isDeleted = false')
      .andWhere('invoice.locationId = :locationId', { locationId });

    const [invoices, total] = await Promise.all([
      baseQuery()
        .select('invoice.id', 'id')
        .addSelect('invoice.date', 'date')
        .addSelect('invoice.invoiceNumber', 'invoice_number')
        .addSelect('invoice.total', 'amount')
        .addSelect('ip.amount', 'paymentAmount')
        .addSelect('invoice.balance', 'balance')
        .orderBy('invoice.date', 'ASC')
        .skip(offset)
        .take(limit)
        .getRawMany(),
      baseQuery().getCount(),
    ]);

    return { invoices, total };
  }
}
