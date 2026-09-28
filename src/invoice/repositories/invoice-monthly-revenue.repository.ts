import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';

@Injectable()
export class InvoiceMonthlyRevenueRepository {
  constructor(
    @InjectRepository(InvoiceLineItem)
    private readonly invoiceLineItemRepository: Repository<InvoiceLineItem>,
  ) {}

  async getMonthlyRevenue(locationId: number, startDate: string, endDate: string): Promise<Array<{ year: number; month: number; revenue: string }>> {
    const queryBuilder = this.invoiceLineItemRepository
      .createQueryBuilder('ili')
      .innerJoin('invoice', 'invoice', 'ili.invoiceId = invoice.id')
      .leftJoin('invoice_reverse', 'ir', 'invoice.id = ir.invoiceId')
      .select([
        'YEAR(invoice.date) as year',
        'MONTH(invoice.date) as month',
        'SUM(ili.netTotal) as revenue',
      ])
      .where('invoice.locationId = :locationId', { locationId })
      .andWhere('ili.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('invoice.isDeleted = :invoiceDeleted', { invoiceDeleted: false })
      .andWhere('invoice.isCanceled = :isCanceled', { isCanceled: false })
      .andWhere('invoice.type = :invoiceType', { invoiceType: 2 })
      .andWhere('ir.id IS NULL')
      .andWhere('invoice.date BETWEEN :startDate AND :endDate', { startDate, endDate })
      .groupBy('YEAR(invoice.date), MONTH(invoice.date)')
      .orderBy('YEAR(invoice.date), MONTH(invoice.date)');

    return queryBuilder.getRawMany();
  }
}


