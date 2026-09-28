import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { InvoiceReverse } from '../../invoice/entities/invoice-reverse.entity';
import { Location } from '../../location/entities/location.entity';
import { RoyaltyFreeItemsRequestDto } from '../dto/royalty-free-items/royalty-free-items.request.dto';
import { RoyaltyFreeItemsViewDto, RoyaltyFreeItemRowDto } from '../dto/royalty-free-items/royalty-free-items.response.dto';
const { parseFlexibleDate, formatLegacyDate, formatLongDate } = require('../../utils/date-utils');

@Injectable()
export class RoyaltyFreeItemsReportService {
  constructor(
    @InjectRepository(Invoice) private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem) private readonly invoiceLineItemRepository: Repository<InvoiceLineItem>,
    @InjectRepository(InvoiceReverse) private readonly invoiceReverseRepository: Repository<InvoiceReverse>,
    @InjectRepository(Location) private readonly locationRepository: Repository<Location>,
  ) {}

  private resolveDates(startDate?: string, endDate?: string): { start: Date; end: Date } {
    const today = new Date();
    const parsedStart = parseFlexibleDate(startDate);
    const parsedEnd = parseFlexibleDate(endDate);
    const start = parsedStart ?? new Date(today.toISOString().slice(0, 10));
    const end = parsedEnd ?? new Date(today.toISOString().slice(0, 10));
    return { start, end };
  }

  async getRoyaltyFreeItems(
    locationSlug: string,
    requestDto: RoyaltyFreeItemsRequestDto,
  ): Promise<RoyaltyFreeItemsViewDto> {
    const { start, end } = this.resolveDates(requestDto.startDate, requestDto.endDate);
    const page = requestDto.page || 1;
    const limit = requestDto.limit || 20;

    const location = await this.locationRepository.findOne({ where: { slug: locationSlug } });
    if (!location) {
      return {
        body: [],
        footer: { total: '0.00' },
        pagination: { page, limit, total: 0, totalPages: 1 },
      };
    }

    const queryBuilder = this.invoiceLineItemRepository
      .createQueryBuilder('invoiceLineItem')
      .select([
        'invoiceLineItem.id as lineItemId',
        'invoice.invoice_number as invoiceNumber',
        'invoice.date as invoiceDate',
        'invoiceLineItem.code as code',
        'invoiceLineItem.description as description',
        'invoiceLineItem.netTotal as subtotal',
        'COALESCE(invoiceLineItem.taxRate, 0) as tax',
        'ROUND(invoiceLineItem.netTotal + COALESCE(invoiceLineItem.taxRate, 0), 2) as total',
      ])
      .innerJoin(Invoice, 'invoice', 'invoice.id = invoiceLineItem.invoice_id')
      .where('invoiceLineItem.isDeleted = false')
      .andWhere('invoice.isDeleted = false')
      .andWhere('invoice.isCanceled = false')
      .andWhere('invoice.type = :invoiceType', { invoiceType: 2 })
      .andWhere('invoice.location_id = :locationId', { locationId: location.id })
      .andWhere('invoiceLineItem.royaltyFree = :royaltyFree', { royaltyFree: 1 })
      .andWhere('invoice.date >= :start AND invoice.date < :endNext', { start: start.toISOString().slice(0, 10), endNext: new Date(end.getTime() + 86400000).toISOString().slice(0, 10) })
      .leftJoin(InvoiceReverse, 'invoiceReverse', 'invoiceReverse.invoiceId = invoice.id')
      .andWhere('invoiceReverse.id IS NULL')
      .orderBy('invoice.date', 'ASC')
      .addOrderBy('invoiceLineItem.id', 'ASC');

    const countRow = await queryBuilder.clone().select('COUNT(*)', 'cnt').orderBy().offset(undefined as any).limit(undefined as any).getRawOne();
    const total = Number((countRow && (countRow as any).cnt) || 0);
    const rows = await queryBuilder.offset((page - 1) * limit).limit(limit).getRawMany();


    console.log(rows);
    const items: RoyaltyFreeItemRowDto[] = rows.map((row: any) => ({
      lineItemId: String(row.lineItemId),
      id: row.invoiceNumber != null ? `I-${String(row.invoiceNumber)}` : '',
      date: formatLegacyDate(new Date(row.invoiceDate)),
      code: row.code || '',
      description: row.description || '',
      subtotal: Number(row.subtotal || 0).toFixed(2),
      tax: Number(row.tax || 0).toFixed(2),
      total: Number(row.total || 0).toFixed(2),
    }));

    const footerTotals = items.reduce(
      (acc, it) => {
        acc.subtotal += Number(it.subtotal);
        acc.tax += Number(it.tax);
        acc.total += Number(it.total);
        return acc;
      },
      { subtotal: 0, tax: 0, total: 0 },
    );


    return {
      body: items,
      footer: {
        // subtotal: footerTotals.subtotal.toFixed(2),
        // tax: footerTotals.tax.toFixed(2),
        total: footerTotals.total.toFixed(2),
      },
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }
}


