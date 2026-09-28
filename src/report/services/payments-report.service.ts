import { Injectable } from '@nestjs/common';
import { Location } from '../../location/entities/location.entity';
import { LocationService } from '../../location/services/location.service';
import { PaymentsReportRepository } from '../repositories/payments-report.repository';
import { PaymentsReportTransformationService } from './transformations/payments-report-transformation.service';
const { parseFlexibleDate, formatLegacyDate } = require('../../utils/date-utils');

@Injectable()
export class PaymentsReportService {
  constructor(
    private readonly locationService: LocationService,
    private readonly paymentsRepository: PaymentsReportRepository,
    private readonly paymentsTransformer: PaymentsReportTransformationService,
  ) {}

  private resolveDates(startDate?: string, endDate?: string): { start: Date; end: Date } {
    const today = new Date();
    const parsedStart = parseFlexibleDate(startDate);
    const parsedEnd = parseFlexibleDate(endDate);
    const start = parsedStart ?? new Date(today.toISOString().slice(0, 10));
    const end = parsedEnd ?? new Date(today.toISOString().slice(0, 10));
    return { start, end };
  }

  async getPaymentsReport(
    locationSlug: string,
    startDate?: string,
    endDate?: string,
    page = 1,
    limit = 20,
    summaryOnly = false,
  ) {
    const { start, end } = this.resolveDates(startDate, endDate);
    // Inclusive date-only range to  avoid timezone drift
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const startStr = `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`;
    const endStr = `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`;
    // Normalize pagination inputs
    page = Math.max(1, Number(page) || 1);
    limit = Math.max(1, Number(limit) || 20);
    summaryOnly = Boolean(summaryOnly);

    const locationId = await this.locationService.getLocationId(locationSlug);
    
    if (!locationId) {
      return {
        body: [],
        footer: { amount: '0.00' },
        pagination: { page, limit, total: 0, totalPages: 1 },
      };
    }

    const { total, rows } = await this.paymentsRepository.getPaymentsRows(
      locationId,
      startStr,
      endStr,
      page,
      limit,
      summaryOnly,
    );

    const grandTotal = await this.paymentsRepository.getGrandTotal(locationId, startStr, endStr);

    const paymentsReportData = this.paymentsTransformer.transformDetailRows(rows);

    if (summaryOnly) {
      const allSummaryRows = await this.paymentsRepository.getSummaryRows(locationId, startStr, endStr);
      const totalGroups = allSummaryRows.length;
      const pageStart = (page - 1) * limit;
      const pageRows = allSummaryRows.slice(pageStart, pageStart + limit);

      const body = this.paymentsTransformer.transformSummaryRows(pageRows);

      const pageSum = pageRows.reduce((acc: number, r: any) => acc + Number(r.amount || 0), 0);

      return {
        body,
        footer: { amount: pageSum.toFixed(2) },
        grandTotals: { amount: Number(grandTotal || 0).toFixed(2) },
        pagination: { page, limit, total: totalGroups, totalPages: Math.max(1, Math.ceil(totalGroups / limit)) }
      };
    }

    // Footer should reflect the current page sum; provide grandTotals for full-range sum
    const pageSum = rows.reduce((acc: number, r: any) => acc + Number(r.amount || 0), 0);

    return {
      body: paymentsReportData,
      footer: { amount: pageSum.toFixed(2) },
      grandTotals: { amount: Number(grandTotal || 0).toFixed(2) },
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }
}


