import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { Item } from '../../item/entities/item.entity';
import { Location } from '../../location/entities/location.entity';
import { ItemReportRequestDto } from '../dto/items-dto/item-report.request.dto';
import { ItemReportResponseDto, ItemReportRowDto } from '../dto/items-dto/item-report.response.dto';
import { InvoiceReverse } from '../../invoice/entities/invoice-reverse.entity';
const { parseFlexibleDate, formatLegacyDate, formatLongDate } = require('../../utils/date-utils');

@Injectable()
export class ItemsReportService {
  constructor(
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem) private readonly lineItemRepo: Repository<InvoiceLineItem>,
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
    @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
  ) { }

  private resolveDates(startDate?: string, endDate?: string): { start: Date; end: Date } {
    const today = new Date();
    const parsedStart = parseFlexibleDate(startDate);
    const parsedEnd = parseFlexibleDate(endDate);
    const start = parsedStart ?? new Date(today.toISOString().slice(0, 10));
    const end = parsedEnd ?? new Date(today.toISOString().slice(0, 10));
    return { start, end };
  }

  async getItemsReport(locationSlug: string, requestDto: ItemReportRequestDto): Promise<ItemReportResponseDto> {
    const { start, end } = this.resolveDates(requestDto.startDate, requestDto.endDate);
    // Inclusive date-only range to avoid timezone drift
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const startStr = `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`;
    const endStr = `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`;
    const page = requestDto.page || 1;
    const limit = requestDto.limit || 20;
    const location = await this.locationRepo.findOne({ where: { slug: locationSlug } });
    if (!location) {
      return {
        body: [],
        footer: { amount: '0.00' },
        grandTotals: { amount: '0.00' },
        meta: { startDate: formatLegacyDate(start), endDate: formatLegacyDate(end), location: locationSlug },
        pagination: { page, limit, total: 0, totalPages: 1 }
      };
    }

    // Base query
    const qb = this.lineItemRepo
      .createQueryBuilder('invoiceLineItem')
      .select([
        'invoice.date as invoiceDate',
        'item.code as itemCode',
        'invoiceLineItem.netTotal as netTotal',
        'COALESCE(invoiceLineItem.taxRate, 0) as tax',
        'ROUND(invoiceLineItem.netTotal + COALESCE(invoiceLineItem.taxRate, 0), 2) as amount'
      ])
      .innerJoin(Invoice, 'invoice', 'invoice.id = invoiceLineItem.invoice_id')
      .innerJoin(Item, 'item', 'item.id = invoiceLineItem.item_id')
      .where('invoice.isDeleted = false')
      .andWhere('invoice.isCanceled = false')
      .andWhere('invoiceLineItem.isDeleted = false')
      .andWhere('invoice.type = :invoiceType', { invoiceType: 2 })
      .andWhere('invoice.location_id = :locationId', { locationId: location.id })
      .andWhere('DATE(invoice.date) BETWEEN :start AND :end', { start: startStr, end: endStr })
      .leftJoin(InvoiceReverse, 'invoiceReverse', 'invoiceReverse.invoiceId = invoice.id')
      .andWhere('invoiceReverse.id IS NULL')
      .groupBy('invoiceLineItem.id, item.id, DATE(invoice.date)')
      .orderBy('DATE(invoice.date)', 'ASC')

    const total = await qb.getCount();
    const rows = await qb.offset((page - 1) * limit).limit(limit).getRawMany();

    const items: ItemReportRowDto[] = rows.map((r: any) => ({
      dateLabel: formatLongDate(new Date(r.invoiceDate)),
      itemCode: r.itemCode,
      amount: (Number(r.netTotal || 0) + Number(r.tax || 0)).toFixed(2),
    }));

    // Sum from unrounded raw fields to match legacy totals
    const totalsAmount = rows.reduce((acc, r: any) => acc + Number(r.netTotal || 0) + Number(r.tax || 0), 0);

    // Grand totals
    const grandRows = await qb.clone().offset(undefined as any).limit(undefined as any).getRawMany();
    const grandAmount = grandRows.reduce((acc, r: any) => acc + Number(r.netTotal || 0) + Number(r.tax || 0), 0);

    return {
      body: items,
      footer: { amount: totalsAmount.toFixed(2) },
      grandTotals: { amount: grandAmount.toFixed(2) },
      meta: { startDate: formatLegacyDate(start), endDate: formatLegacyDate(end), location: locationSlug },
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
    };
  }
}


