import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EnrolmentGainsRequestDto } from '../dto/enrolment-gains-request.dto';
import { EnrolmentGainsDataDto, EnrolmentGainValueDto } from '../dto/enrolment-gains-response.dto';
import { EnrolmentGainsRepository } from '../../enrolment/repositories/enrolment-gains.repository';
import { EnrolmentLossesRepository } from '../../enrolment/repositories/enrolment-losses.repository';
import { EnrolmentParkedRepository } from '../../enrolment/repositories/enrolment-parked.repository';
import { EnrolmentLossesRequestDto } from '../dto/enrolment-losses-request.dto';
import { EnrolmentLossesResponseDto, EnrolmentLossValueDto } from '../dto/enrolment-losses-response.dto';
import { InstructionHoursRequestDto } from '../dto/instruction-hours-request.dto';
import { InstructionHoursResponseDto, InstructionHoursValueDto } from '../dto/instruction-hours-response.dto';
import { LessonInstructionHoursRepository } from '../../lesson/repositories/lesson-instruction-hours.repository';
import { MonthlyRevenueResponseDto, MonthlyRevenueValueDto } from '../dto/monthly-revenue-response.dto';
import { getMonthName, runReport, sumBy } from '../utils/report.utils';
import { InvoiceMonthlyRevenueRepository } from '../../invoice/repositories/invoice-monthly-revenue.repository';
import { CacheService } from '../../cache/cache.service';
import { RoyaltyReportRepository } from '../../report/repositories/royalty-report.repository';

// Raw row shapes from repositories
type GainsRaw = { name: string; count: string };
type LossesRaw = { name: string; count: string };
type ParkedRaw = { name: string; count: string };
type InstructionHoursRaw = { name: string; hours: string; type: number };
type MonthlyRevenueRaw = { year: number; month: number; revenue: string };

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly enrolmentGainsRepository: EnrolmentGainsRepository,
    private readonly enrolmentLossesRepository: EnrolmentLossesRepository,
    private readonly enrolmentParkedRepository: EnrolmentParkedRepository,
    private readonly lessonInstructionHoursRepository: LessonInstructionHoursRepository,
    private readonly invoiceMonthlyRevenueRepository: InvoiceMonthlyRevenueRepository,
    private readonly royaltyReportRepository: RoyaltyReportRepository,
    private readonly cacheService: CacheService,
  ) {}

  

  async getEnrolmentGains(
    locationId: number,
    queryParams: EnrolmentGainsRequestDto,
  ): Promise<EnrolmentGainsDataDto> {
    try {
      const { fromDate, toDate } = this.parseDateRange(queryParams);
      const cacheKey = this.getEnrolmentGainsCacheKey(locationId, fromDate, toDate);
      return await this.cacheService.remember<EnrolmentGainsDataDto>(cacheKey, async () => {
        const { values, total } = await runReport<[number, string, string], GainsRaw, EnrolmentGainValueDto, EnrolmentGainsDataDto>(
          this.enrolmentGainsRepository.getGains.bind(this.enrolmentGainsRepository),
          (r: GainsRaw): EnrolmentGainValueDto => ({ name: r.name, count: parseInt(r.count, 10) }),
          (vals) => sumBy(vals, v => v.count),
          locationId,
          fromDate,
          toDate,
        );
        return { values, total: total! };
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to fetch enrolment gains: ${error.message}`);
    }
  }

  async getEnrolmentLosses(
    locationId: number,
    queryParams: EnrolmentLossesRequestDto,
  ): Promise<EnrolmentLossesResponseDto> {
    try {
      const { fromDate, toDate } = this.parseDateRange(queryParams);
      const cacheKey = this.getEnrolmentLossesCacheKey(locationId, fromDate, toDate);
      return await this.cacheService.remember<EnrolmentLossesResponseDto>(cacheKey, async () => {
        const { values, total } = await runReport<[number, string, string], LossesRaw, EnrolmentLossValueDto, EnrolmentLossesResponseDto>(
          this.enrolmentLossesRepository.getLosses.bind(this.enrolmentLossesRepository),
          (r: LossesRaw): EnrolmentLossValueDto => ({ name: r.name, count: parseInt(r.count, 10) }),
          (vals) => sumBy(vals, v => v.count),
          locationId,
          fromDate,
          toDate,
        );
        return { values, total: total! };
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to fetch enrolment losses: ${error.message}`);
    }
  }

  async getParkedEnrolments(
    locationId: number,
    queryParams: EnrolmentGainsRequestDto,
  ): Promise<EnrolmentGainsDataDto> {
    try {
      const { fromDate, toDate } = this.parseDateRange(queryParams);
      const referenceDate = this.getParkedReferenceDate(toDate);
      const cacheKey = this.getParkedEnrolmentsCacheKey(locationId, fromDate, toDate);
      return await this.cacheService.remember<EnrolmentGainsDataDto>(cacheKey, async () => {
        const { values, total } = await runReport<[number, string, string, string], ParkedRaw, EnrolmentGainValueDto, EnrolmentGainsDataDto>(
          this.enrolmentParkedRepository.getParked.bind(this.enrolmentParkedRepository),
          (r: ParkedRaw): EnrolmentGainValueDto => ({ name: r.name, count: parseInt(r.count, 10) }),
          (vals) => sumBy(vals, v => v.count),
          locationId,
          fromDate,
          toDate,
          referenceDate,
        );
        return { values, total: total! };
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to fetch parked enrolments: ${error.message}`);
    }
  }

  async getInstructionHours(
    locationId: number,
    queryParams: InstructionHoursRequestDto,
  ): Promise<InstructionHoursResponseDto> {
    try {
      const { fromDate, toDate } = this.parseDateRange(queryParams);
      const cacheKey = this.getInstructionHoursCacheKey(locationId, fromDate, toDate);
      return await this.cacheService.remember<InstructionHoursResponseDto>(cacheKey, async () => {
        const fromDateTime = `${fromDate} 00:00:00`;
        const toDateTime = `${toDate} 23:59:59`;
        const { values, total } = await runReport<[number, string, string], InstructionHoursRaw, InstructionHoursValueDto, InstructionHoursResponseDto>(
          this.lessonInstructionHoursRepository.getInstructionHours.bind(this.lessonInstructionHoursRepository),
          (r: InstructionHoursRaw): InstructionHoursValueDto => ({ name: r.name, count: parseFloat(r.hours) / 3600 || 0 }),
          (vals) => sumBy(vals, v => v.count),
          locationId,
          fromDateTime,
          toDateTime,
        );
        return { values, total: total! };
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to fetch instruction hours: ${error.message}`);
    }
  }

  async getMonthlyRevenue(locationId: number): Promise<MonthlyRevenueResponseDto> {
    try {
      // Calculate date range for last 6 months
      const { startDate, endDate } = this.getLastSixMonthsRange();
      const monthlyRanges = this.getMonthlyRanges(startDate, endDate);
      const cacheKey = this.getMonthlyRevenueCacheKey(locationId, startDate, endDate);
      return await this.cacheService.remember<MonthlyRevenueResponseDto>(cacheKey, async () => {
        const [{ values: monthlyRevenueRows }, collectedRevenueByMonth] =
          await Promise.all([
            runReport<
              [number, string, string],
              MonthlyRevenueRaw,
              MonthlyRevenueRaw,
              { values: MonthlyRevenueRaw[] }
            >(
              this.invoiceMonthlyRevenueRepository.getMonthlyRevenue.bind(
                this.invoiceMonthlyRevenueRepository,
              ),
              (r: MonthlyRevenueRaw): MonthlyRevenueRaw => r,
              undefined,
              locationId,
              startDate,
              endDate,
            ),
            this.getCollectedRevenueByMonth(locationId, startDate, endDate),
          ]);
        const usedRevenueByMonth = new Map(
          monthlyRevenueRows.map((row) => [
            this.getMonthKey(row.year, row.month),
            Math.floor(parseFloat(row.revenue) || 0),
          ]),
        );

        const values = monthlyRanges.map(({ year, month }): MonthlyRevenueValueDto => {
          const key = this.getMonthKey(year, month);
          const revenueUsed = usedRevenueByMonth.get(key) || 0;
          const revenueCollected = collectedRevenueByMonth.get(key) || 0;

          return {
            x: getMonthName(month),
            y: revenueUsed,
            revenueUsed,
            revenueCollected,
          };
        });

        return { values };
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to fetch monthly revenue: ${error.message}`);
    }
  }

  private getLastSixMonthsRange(): { startDate: string; endDate: string } {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-based

    // Calculate start date (6 months ago, 1st day of that month)
    const startMonth = currentMonth - 5;
    const startYear = startMonth < 0 ? currentYear - 1 : currentYear;
    const actualStartMonth = startMonth < 0 ? startMonth + 12 : startMonth;
    
    const startDate = new Date(startYear, actualStartMonth, 1);
    // Calculate end date (last day of current month)
    const endDate = new Date(currentYear, currentMonth + 1, 0);

    const formatLocal = (d: Date): string => {
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    return {
      startDate: formatLocal(startDate),
      endDate: formatLocal(endDate),
    };
  }

  // month name logic moved to utils/report.utils.ts

  private parseDateRange(queryParams: EnrolmentGainsRequestDto | EnrolmentLossesRequestDto | InstructionHoursRequestDto): { fromDate: string; toDate: string } {
    let fromDate: string;
    let toDate: string;

    if (queryParams.dateRange) {
      // Parse dateRange format: "YYYY-MM-DD - YYYY-MM-DD"
      const [start, end] = queryParams.dateRange.split(' - ').map(date => date.trim());
      fromDate = start;
      toDate = end;
    } else if (queryParams.fromDate && queryParams.toDate) {
      // Use individual fromDate and toDate
      fromDate = queryParams.fromDate;
      toDate = queryParams.toDate;
    } else {
      // Default to current month
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      fromDate = firstDay.toISOString().split('T')[0];
      toDate = lastDay.toISOString().split('T')[0];
    }

    return { fromDate, toDate };
  }

  private getMonthlyRevenueCacheKey(locationId: number, startDate: string, endDate: string): string {
    return `dashboard:monthly-revenue:v4:${locationId}:${startDate}:${endDate}`;
  }

  private async getCollectedRevenueByMonth(
    locationId: number,
    startDate: string,
    endDate: string,
  ): Promise<Map<string, number>> {
    const monthlyRanges = this.getMonthlyRanges(startDate, endDate);
    const collected = new Map<string, number>();

    for (const { start, end, year, month } of monthlyRanges) {
      const key = this.getMonthKey(year, month);
      try {
        collected.set(
          key,
          await this.royaltyReportRepository.getEligiblePayments(
            locationId,
            start,
            end,
          ),
        );
      } catch (error) {
        this.logger.error(
          `Failed to fetch collected revenue for location ${locationId} ${key}: ${
            error instanceof Error ? error.message : error
          }`,
        );
        collected.set(key, 0);
      }
    }

    return collected;
  }

  private getMonthlyRanges(
    startDate: string,
    endDate: string,
  ): Array<{ start: string; end: string; year: number; month: number }> {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const ranges: Array<{ start: string; end: string; year: number; month: number }> = [];

    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= end) {
      const year = current.getFullYear();
      const month = current.getMonth() + 1;
      const monthStart = new Date(year, current.getMonth(), 1);
      const monthEnd = new Date(year, current.getMonth() + 1, 0);

      ranges.push({
        start: this.formatDate(monthStart),
        end: this.formatDate(monthEnd),
        year,
        month,
      });

      current.setMonth(current.getMonth() + 1);
    }

    return ranges;
  }

  private getMonthKey(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private getEnrolmentGainsCacheKey(locationId: number, fromDate: string, toDate: string): string {
    return `dashboard:enrolment-gains:${locationId}:${fromDate}:${toDate}`;
  }

  private getEnrolmentLossesCacheKey(locationId: number, fromDate: string, toDate: string): string {
    return `dashboard:enrolment-losses:${locationId}:${fromDate}:${toDate}`;
  }

  private getInstructionHoursCacheKey(locationId: number, fromDate: string, toDate: string): string {
    return `dashboard:instruction-hours:${locationId}:${fromDate}:${toDate}`;
  }

  private getParkedEnrolmentsCacheKey(locationId: number, fromDate: string, toDate: string): string {
    return `dashboard:parked-enrolments:${locationId}:${fromDate}:${toDate}`;
  }

  private getParkedReferenceDate(toDate: string): string {
    const today = new Date().toISOString().split('T')[0];
    return today < toDate ? today : toDate;
  }
}
