import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceReverse } from '../../invoice/entities/invoice-reverse.entity';
import { Location } from '../../location/entities/location.entity';
import { User } from '../../user/entities/user.entity';
import { TaxCollectedRequestDto } from '../dto/tax-collected/tax-collected.request.dto';
import { TaxCollectedResponseDto } from '../dto/tax-collected/tax-collected.response.dto';
const { parseFlexibleDate, formatLegacyDate, formatLongDate } = require('../../utils/date-utils');

@Injectable()
export class TaxCollectedReportService {
  constructor(
    @InjectRepository(Invoice) private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoiceReverse) private readonly invoiceReverseRepository: Repository<InvoiceReverse>,
    @InjectRepository(Location) private readonly locationRepository: Repository<Location>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  private resolveDates(startDate?: string, endDate?: string): { start: Date; end: Date } {
    const today = new Date();
    const parsedStart = parseFlexibleDate(startDate);
    const parsedEnd = parseFlexibleDate(endDate);
    const start = parsedStart ?? new Date(today.toISOString().slice(0, 10));
    const end = parsedEnd ?? new Date(today.toISOString().slice(0, 10));
    return { start, end };
  }

  async getTaxCollected(
    locationSlug: string,
    startDate?: string,
    endDate?: string,
    summarize?: boolean,
  ) {
    const { start, end } = this.resolveDates(startDate, endDate);
    // Inclusive date-only range to avoid timezone drift
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const startStr = `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`;
    const endStr = `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`;
    const location = await this.locationRepository.findOne({ where: { slug: locationSlug } });
    if (!location) {
      return {
        body: [],
        footer: { subtotal: '0.00', tax: '0.00', total: '0.00' },
        meta: { startDate: formatLegacyDate(start), endDate: formatLegacyDate(end), location: locationSlug },
      };
    }

    const invoiceQueryBuilder = this.invoiceRepository
      .createQueryBuilder('invoice')
      .select([
        'invoice.id as invoiceId',
        'invoice.date as invoiceDate',
        'invoice.invoiceNumber as invoiceNumber',
        'COALESCE(ROUND(invoice.subTotal, 2), 0) as subtotal',
        'COALESCE(ROUND(invoice.tax, 2), 0) as tax',
        'COALESCE(ROUND(invoice.total, 2), 0) as total',
        'user_profile.firstname as firstName',
        'user_profile.lastname as lastName',
        'user.username as publicIdentity',
      ])
      .leftJoin(User, 'user', 'user.id = invoice.user_id')
      .leftJoin('user_profile', 'user_profile', 'user_profile.user_id = user.id')
      .where('invoice.isDeleted = false')
      .andWhere('invoice.type = :invoiceType', { invoiceType: 2 })
      .andWhere('invoice.location_id = :locationId', { locationId: location.id })
      .andWhere('DATE(invoice.date) BETWEEN :start AND :end', {
        start: startStr,
        end: endStr,
      })
      .leftJoin(InvoiceReverse, 'invoice_reverse', 'invoice_reverse.invoiceId = invoice.id')
      .andWhere('invoice_reverse.id IS NULL')

      // Match legacy: order by invoice date ascending
      .orderBy('invoice.date', 'ASC');

    const rows = await invoiceQueryBuilder.getRawMany();

    // Build legacy-like grouped structure by day
    type Row = { invoiceId: string; dateKey: string; sourceId: string; customer: string; subtotal: string; tax: string; total: string };
    const mapped: Row[] = rows.map((r: any) => {
      const dateObj = new Date(r.invoiceDate);
      const dateKey = formatLongDate(dateObj); // e.g., Monday, September 1st, 2025
      const customer = r.publicIdentity || `${r.firstName || ''} ${r.lastName || ''}`.trim();
      const sourceId = r.invoiceNumber ? `I-${r.invoiceNumber}` : `I-${r.invoiceId}`;
      return {
        invoiceId: String(r.invoiceId),
        dateKey,
        sourceId,
        customer,
        subtotal: parseFloat(r.subtotal || 0).toFixed(2),
        tax: parseFloat(r.tax || 0).toFixed(2),
        total: parseFloat(r.total || 0).toFixed(2),
      };
    });

    const body: Array<{ dateLabel: string; items: Array<{ sourceId: string; customer: string; subtotal: string; tax: string; total: string }>; footer: { subtotal: string; tax: string; total: string } }> = [];
    let currentDateLabel: string | null = null;
    let currentItems: Array<{ sourceId: string; customer: string; subtotal: string; tax: string; total: string }> = [];
    let runningTotals = { subtotal: 0, tax: 0, total: 0 };

    const flushGroup = () => {
      if (currentDateLabel === null) return;
      body.push({
        dateLabel: currentDateLabel,
        items: currentItems,
        footer: {
          subtotal: runningTotals.subtotal.toFixed(2),
          tax: runningTotals.tax.toFixed(2),
          total: runningTotals.total.toFixed(2),
        },
      });
      currentItems = [];
      runningTotals = { subtotal: 0, tax: 0, total: 0 };
    };

    for (const r of mapped) {
      if (currentDateLabel !== r.dateKey) {
        flushGroup();
        currentDateLabel = r.dateKey;
      }
      currentItems.push({ sourceId: r.sourceId, customer: r.customer, subtotal: r.subtotal, tax: r.tax, total: r.total });
      runningTotals.subtotal += Number(r.subtotal);
      runningTotals.tax += Number(r.tax);
      runningTotals.total += Number(r.total);
    }
    flushGroup();

    // Aggregate totals using a cloned query with SUM for performance
    const totalsQueryBuilder = this.invoiceRepository
      .createQueryBuilder('invoice')
      .select([
        'COALESCE(SUM(ROUND(invoice.subTotal, 2)), 0) as subtotal',
        'COALESCE(SUM(ROUND(invoice.tax, 2)), 0) as tax',
        'COALESCE(SUM(ROUND(invoice.total, 2)), 0) as total',
      ])
      .where('invoice.isDeleted = false')
      .andWhere('invoice.type = :invoiceType', { invoiceType: 2 })
      .andWhere('invoice.location_id = :locationId', { locationId: location.id })
      .andWhere('DATE(invoice.date) BETWEEN :start AND :end', {
        start: startStr,
        end: endStr,
      })
      .leftJoin(InvoiceReverse, 'invoice_reverse', 'invoice_reverse.invoiceId = invoice.id')
      .andWhere('invoice_reverse.id IS NULL');

    const totalsRow = await totalsQueryBuilder.getRawOne();

    const footer = {
      subtotal: parseFloat(totalsRow?.subtotal || 0).toFixed(2),
      tax: parseFloat(totalsRow?.tax || 0).toFixed(2),
      total: parseFloat(totalsRow?.total || 0).toFixed(2),
    };

    // If summarize is true, return only daily totals (like legacy summarized view)
    if (summarize) {
      const summarizedGroups = body.map(group => ({
        dateLabel: group.dateLabel,
        subtotal: group.footer.subtotal,
        tax: group.footer.tax,
        total: group.footer.total,
      }));
      
      return {
        body: summarizedGroups,
        footer,
        meta: { startDate: formatLegacyDate(start), endDate: formatLegacyDate(end), location: locationSlug },
      };
    }

    return {
      body,
      footer,
      meta: { startDate: formatLegacyDate(start), endDate: formatLegacyDate(end), location: locationSlug },
    };
  }
}



