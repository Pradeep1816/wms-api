import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { Item } from '../../item/entities/item.entity';
import { Location } from '../../location/entities/location.entity';
import { InvoiceReverse } from '../../invoice/entities/invoice-reverse.entity';
import { ItemCategory } from '../../item/entities/item-category.entity';
import { User } from '../../user/entities/user.entity';
import { ItemCategoryReportResponseDto, ItemCategoryReportRowDto } from '../dto/item-sold-category-dto/item-category-response.dto';
import { formatAmount } from '../../utils/helper';
const { parseFlexibleDate, formatLegacyDate, formatLongDate } = require('../../utils/date-utils');

@Injectable()
export class ItemCategoryReportService {
  constructor(
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem) private readonly lineItemRepo: Repository<InvoiceLineItem>,
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
    @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
    @InjectRepository(ItemCategory) private readonly itemCategoryRepo: Repository<ItemCategory>,
    @InjectRepository(InvoiceReverse) private readonly invoiceReverseRepo: Repository<InvoiceReverse>,
  ) {}

  private resolveDates(startDate?: string, endDate?: string): { start: Date; end: Date } {
    const today = new Date();
    const parsedStart = parseFlexibleDate(startDate);
    const parsedEnd = parseFlexibleDate(endDate);
    const start = parsedStart ?? new Date(today.toISOString().slice(0, 10));
    const end = parsedEnd ?? new Date(today.toISOString().slice(0, 10));
    return { start, end };
  }

  async getItemCategoryReport(
    locationSlug: string,
    startDate?: string,
    endDate?: string,
    categoryId?: string,
    page = 1,
    limit = 20,
    summaryOnly = false,
  ): Promise<ItemCategoryReportResponseDto> {
    const { start, end } = this.resolveDates(startDate, endDate);
    // Inclusive date-only range to avoid timezone drift
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const startStr = `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`;
    const endStr = `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`;

    const location = await this.locationRepo.findOne({ where: { slug: locationSlug } });
    if (!location) {
      return {
        body: [],
        footer: { subtotal: '0.00', tax: '0.00', total: '0.00' },
        meta: { startDate: formatLegacyDate(start), endDate: formatLegacyDate(end), location: locationSlug },
        mainFooter: { subtotal: '0.00', tax: '0.00', total: '0.00' },
        pagination: { page, limit, total: 0, totalPages: 1 },
      };
    }

    let categoryName: string | undefined;
    if (categoryId) {
      const category = await this.itemCategoryRepo.findOne({ where: { id: Number(categoryId) as any } as any });
      categoryName = category?.name;
    }

    const qb = this.lineItemRepo
      .createQueryBuilder('invoiceLineItem')
      .select([
        'invoice.id as invoiceId',
        'invoice.date as invoiceDate',
        'invoice.invoice_number as invoiceNumber',
        'invoice.user_id as customerId',
        'CONCAT(COALESCE(user_profile.firstname, ""), " ", COALESCE(user_profile.lastname, "")) as customerName',
        'itemCategory.id as itemCategoryId',
        'itemCategory.name as itemCategoryName',
        'invoiceLineItem.description as description',
        'invoiceLineItem.netTotal as subtotal',
        'invoiceLineItem.taxRate as tax',
        '(invoiceLineItem.netTotal + invoiceLineItem.taxRate) as total',
      ])
      .innerJoin('invoice', 'invoice', 'invoice.id = invoiceLineItem.invoice_id')
      .innerJoin('item', 'item', 'item.id = invoiceLineItem.item_id')
      .innerJoin('item_category', 'itemCategory', 'itemCategory.id = item.itemCategoryId')
      .leftJoin('user', 'user', 'user.id = invoice.user_id')
      .leftJoin('user_profile', 'user_profile', 'user_profile.user_id = user.id')
      .leftJoin('invoice_reverse', 'invoice_reverse', 'invoice_reverse.invoiceId = invoice.id')
      .where('invoice.isDeleted = false')
      .andWhere('invoiceLineItem.isDeleted = false')
      .andWhere('invoice.type = :invoiceType', { invoiceType: 2 })
      .andWhere('invoice.location_id = :locationId', { locationId: location.id })
      .andWhere('DATE(invoice.date) BETWEEN :start AND :end', { start: startStr, end: endStr })
      .andWhere('invoice_reverse.id IS NULL')
      .orderBy('invoice.date', 'ASC')
      .addOrderBy('itemCategory.id', 'ASC');
    

    if (categoryId) {
      qb.andWhere('itemCategory.id = :categoryId', { categoryId });
    }


    let total = 0;
    let items: ItemCategoryReportRowDto[] = [];
    if (!summaryOnly) {
      const countQb = qb.clone()
        .select('COUNT(*)', 'cnt')
        .orderBy()
        .offset(undefined as any)
        .limit(undefined as any);
      const countRow = await countQb.getRawOne();
      total = Number((countRow && (countRow as any).cnt) || 0);

      const raw = await qb.offset((page - 1) * limit).limit(limit).getRawMany();

      items = raw.map((row: any) => ({
        invoiceId: String(row.invoiceId),
        invoiceNumber:  `I-${String(row.invoiceNumber)}`,
        invoiceDate: formatLongDate(new Date(row.invoiceDate)),
        customerId: String(row.customerId),
        customerName: (row.customerName || '').trim() || '-',
        itemCategoryId: String(row.itemCategoryId),
        categoryName: row.itemCategoryName,
        description: row.description,
        subtotal: formatAmount(Number(row.subtotal || 0)),
        tax: formatAmount(Number(row.tax || 0)),
        total: formatAmount(Number(row.total || 0)),
      }));
    } else {
      // Summary mode: group by date and item category
      const summaryBaseQb = this.lineItemRepo
        .createQueryBuilder('invoiceLineItem')
        .select([
          "DATE_FORMAT(invoice.date, '%W, %M %D, %Y') AS dateLabel",
          'itemCategory.name AS categoryName',
          'invoiceLineItem.netTotal AS subtotal',
          'COALESCE(SUM(invoiceLineItem.taxRate), 0) AS tax',
          'COALESCE(SUM(invoiceLineItem.netTotal + COALESCE(invoiceLineItem.taxRate, 0)), 0) AS total',
        ])
        .innerJoin('invoice', 'invoice', 'invoice.id = invoiceLineItem.invoice_id')
        .innerJoin('item', 'item', 'item.id = invoiceLineItem.item_id')
        .innerJoin('item_category', 'itemCategory', 'itemCategory.id = item.itemCategoryId')
        .leftJoin('invoice_reverse', 'invoice_reverse', 'invoice_reverse.invoiceId = invoice.id')
        .where('invoice.isDeleted = false')
        .andWhere('invoice.isCanceled = false')
        .andWhere('invoiceLineItem.isDeleted = false')
        .andWhere('invoice.type = :invoiceType', { invoiceType: 2 })
        .andWhere('invoice.location_id = :locationId', { locationId: location.id })
        .andWhere('DATE(invoice.date) BETWEEN :start AND :end', { start: startStr, end: endStr })
        .andWhere(categoryId ? 'item.itemCategoryId = :categoryId' : '1=1', { categoryId })
        .andWhere('invoice_reverse.id IS NULL')
        .groupBy("DATE_FORMAT(invoice.date, '%W, %M %D, %Y')")
        .addGroupBy('itemCategory.name')
        .orderBy('MIN(invoice.date)', 'ASC')
        .addOrderBy('itemCategory.name', 'ASC');

      const allSummaryRows = await summaryBaseQb.getRawMany();
      const totalGroups = allSummaryRows.length;
      const pageStart = (page - 1) * limit;
      const pageRows = allSummaryRows.slice(pageStart, pageStart + limit);

      // Build a lightweight body compatible with client summary view
      const summaryBody = pageRows.map((r: any) => ({
        dateLabel: r.dateLabel,
        categoryName: r.categoryName,
        subtotal: Number(r.subtotal || 0).toFixed(2),
        tax: Number(r.tax || 0).toFixed(2),
        total: Number(r.total || 0).toFixed(2),
      }));

      // Sum rounded per-group subtotals to mirror legacy totals (e.g., 28.75 + ...)
      const pageSubtotal = pageRows.reduce((acc: number, r: any) => acc + Number(Number(r.subtotal || 0).toFixed(2)), 0);
      const allGroupsSubtotal = allSummaryRows.reduce((acc: number, r: any) => acc + Number(Number(r.subtotal || 0).toFixed(2)), 0);
      const pageTax = pageRows.reduce((acc: number, r: any) => acc + Number(r.tax || 0), 0);
      const pageTotal = pageRows.reduce((acc: number, r: any) => acc + Number(r.total || 0), 0);

      // Reuse grandRow computed below for grand totals
      const grandRow = await this.lineItemRepo
        .createQueryBuilder('invoiceLineItem')
        .innerJoin('invoice', 'invoice', 'invoice.id = invoiceLineItem.invoice_id')
        .innerJoin('item', 'item', 'item.id = invoiceLineItem.item_id')
        .where('invoice.isDeleted = false')
        .andWhere('invoice.isCanceled = false')
        .andWhere('invoiceLineItem.isDeleted = false')
        .andWhere('invoice.type = :invoiceType', { invoiceType: 2 })
        .andWhere('invoice.location_id = :locationId', { locationId: location.id })
        .andWhere('DATE(invoice.date) BETWEEN :start AND :end', { start: startStr, end: endStr })
        .andWhere(categoryId ? 'item.itemCategoryId = :categoryId' : '1=1', { categoryId })
        .select('COALESCE(SUM(invoiceLineItem.netTotal), 0)', 'subtotal')
        .addSelect('COALESCE(SUM(invoiceLineItem.taxRate), 0)', 'tax')
        .addSelect('COALESCE(SUM(invoiceLineItem.netTotal + invoiceLineItem.taxRate), 0)', 'total')
        .getRawOne();

      return {
        body: summaryBody,
        footer: {
          subtotal: Number(pageSubtotal).toFixed(2),
          tax: Number(pageTax).toFixed(2),
          total: Number(pageTotal).toFixed(2),
        },
        meta: {
          startDate: formatLegacyDate(start),
          endDate: formatLegacyDate(end),
          location: locationSlug,
          categoryId,
          categoryName,
        },
        mainFooter: {
          subtotal: Number(allGroupsSubtotal).toFixed(2),
          tax: Number((grandRow as any)?.tax || 0).toFixed(2),
          total: Number((grandRow as any)?.total || 0).toFixed(2),
        },
        pagination: { page, limit, total: totalGroups, totalPages: Math.max(1, Math.ceil(totalGroups / limit)) },
      } as any;
    }

    const grandRow = await this.lineItemRepo
      .createQueryBuilder('invoiceLineItem')
      .innerJoin('invoice', 'invoice', 'invoice.id = invoiceLineItem.invoice_id')
      .innerJoin('item', 'item', 'item.id = invoiceLineItem.item_id')
      .where('invoice.isDeleted = false')
      .andWhere('invoice.isCanceled = false')
      .andWhere('invoiceLineItem.isDeleted = false')
      .andWhere('invoice.type = :invoiceType', { invoiceType: 2 })
      .andWhere('invoice.location_id = :locationId', { locationId: location.id })
      .andWhere('DATE(invoice.date) BETWEEN :start AND :end', { start: startStr, end: endStr })
      .andWhere(categoryId ? 'item.itemCategoryId = :categoryId' : '1=1', { categoryId })
      .select('COALESCE(SUM(invoiceLineItem.netTotal), 0)', 'subtotal')
      .addSelect('COALESCE(SUM(invoiceLineItem.taxRate), 0)', 'tax')
      .addSelect('COALESCE(SUM(invoiceLineItem.netTotal + invoiceLineItem.taxRate), 0)', 'total')
      .getRawOne();

    // When summaryOnly, body is empty and footer should match grand totals
    const footerSubtotal = summaryOnly
      ? Number((grandRow as any)?.subtotal || 0)
      : items.reduce((acc, it) => acc + Number(it.subtotal), 0);
    const footerTax = summaryOnly
      ? Number((grandRow as any)?.tax || 0)
      : items.reduce((acc, it) => acc + Number(it.tax), 0);
    const footerTotal = summaryOnly
      ? Number((grandRow as any)?.total || 0)
      : items.reduce((acc, it) => acc + Number(it.total), 0);

    return {
      body: summaryOnly ? [] : items,
      footer: {
        subtotal: formatAmount(footerSubtotal),
        tax: formatAmount(footerTax),
        total: formatAmount(footerTotal),
      },
      meta: {
        startDate: formatLegacyDate(start),
        endDate: formatLegacyDate(end),
        location: locationSlug,
        categoryId,
        categoryName,
      },
      mainFooter: {
        subtotal: formatAmount(Number((grandRow as any)?.subtotal || 0)),
        tax: formatAmount(Number((grandRow as any)?.tax || 0)),
        total: formatAmount(Number((grandRow as any)?.total || 0)),
      },
      pagination: summaryOnly
        ? { page: 1, limit, total: 0, totalPages: 1 }
        : { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }
}


