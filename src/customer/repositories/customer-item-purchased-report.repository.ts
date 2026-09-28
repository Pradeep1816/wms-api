import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';

@Injectable()
export class CustomerItemPurchasedReportRepository {
  constructor(
    @InjectRepository(InvoiceLineItem)
    private readonly invoiceLineItemRepo: Repository<InvoiceLineItem>,
  ) {}

  async getCustomerItemPurchasedReport(
    userId: number,
    locationId: number,
    fromDate: string,
    toDate: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<any> {
    // Build query to get item purchased report
    const lineItemQb = this.invoiceLineItemRepo
      .createQueryBuilder('invoiceLineItem')
      .leftJoin('item', 'item', 'item.id = invoiceLineItem.item_id')
      .leftJoin('item_category', 'itemCategory', 'itemCategory.id = item.itemCategoryId')
      .leftJoin('invoice', 'invoice', 'invoice.id = invoiceLineItem.invoice_id')
      .leftJoin('invoice_reverse', 'reverseInvoice', 'reverseInvoice.reversedInvoiceId = invoice.id')
      .where('invoiceLineItem.isDeleted = false')
      .andWhere('invoice.user_id = :userId', { userId })
      .andWhere('reverseInvoice.id IS NULL')
      .andWhere('invoice.location_id = :locationId', { locationId })
      .andWhere('invoice.isDeleted = false')
      .andWhere('invoice.isCanceled = false')
      .andWhere('invoice.type = :type', { type: 2 })
      .andWhere('DATE(invoice.date) BETWEEN :fromDate AND :toDate', {
        fromDate,
        toDate,
      });

    const countQb = lineItemQb.clone()
      .select('COUNT(*)', 'cnt')
      .orderBy()
      .offset(undefined as any)
      .limit(undefined as any);

    // Get total number of items purchased
    const countRow = await countQb.getRawOne();
    const total = Number((countRow && (countRow as any).cnt) || 0);

    const itemReportData= await lineItemQb
      .select([
        'invoiceLineItem.id AS id',
        'itemCategory.name AS category_name',
        'invoiceLineItem.description AS description',
        'invoice.date AS invoice_date',
        'invoiceLineItem.netTotal AS net_total',
        'invoiceLineItem.taxRate AS tax_rate',
        '(invoiceLineItem.netTotal + COALESCE(invoiceLineItem.taxRate, 0)) AS item_total',
      ])
      .orderBy('invoiceLineItem.netTotal', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany();

    return { itemReportData, total };
  }
}

