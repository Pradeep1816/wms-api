import { Injectable } from '@nestjs/common';
import { AllLocationsReportResponseDto } from '../dto/all-locations-dto/all-locations-response.dto';
import { RoundingUtils } from '../../utils/rounding.utils';
import {
  AllLocationsReportRawInputs,
  AllLocationsReportRepository,
} from '../repositories/all-locations-report.repository';
const { convertLegacyDateFormat } = require('../../utils/date-utils');

/**
 * All Locations financial report business logic.
 *
 * Royalty dual path (same rule as single-location Royalty Report):
 * - no PAYMENT_RECEIVED ledger in range → legacy location-rate formula
 * - ledger recognition exists → category/ledger payment-based formula
 *
 * Database access lives in AllLocationsReportRepository.
 */
@Injectable()
export class LocationReportService {
  constructor(
    private readonly allLocationsReportRepository: AllLocationsReportRepository,
  ) {}

  /**
   * Builds the All Locations report for an optional date range.
   * Defaults both ends to today's US/Eastern date when omitted.
   */
  async getAllLocations(
    startDate?: string,
    endDate?: string,
  ): Promise<AllLocationsReportResponseDto> {
    const currentDate = new Date();
    const currentDateStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'US/Eastern',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(currentDate);

    const fromDate = startDate || currentDateStr;
    const toDate = endDate || currentDateStr;

    const locations =
      await this.allLocationsReportRepository.findReportLocations();
    const results = await this.buildLocationRows(locations, fromDate, toDate);

    const summaryTotals = results.reduce(
      (acc, location) => {
        acc.totalActiveEnrolments += location.activeEnrolments;
        acc.totalRevenue += parseFloat(location.revenue);
        acc.totalRoyalty += parseFloat(location.royalty);
        acc.totalAdvertisement += parseFloat(location.advertisement);
        acc.totalTax += parseFloat(location.hst);
        acc.grandTotal += parseFloat(location.total);
        return acc;
      },
      {
        totalActiveEnrolments: 0,
        totalRevenue: 0,
        totalRoyalty: 0,
        totalAdvertisement: 0,
        totalTax: 0,
        grandTotal: 0,
      },
    );

    summaryTotals.totalRevenue = RoundingUtils.roundForDatabase(
      summaryTotals.totalRevenue,
    );
    summaryTotals.totalRoyalty = RoundingUtils.roundForDatabase(
      summaryTotals.totalRoyalty,
    );
    summaryTotals.totalAdvertisement = RoundingUtils.roundForDatabase(
      summaryTotals.totalAdvertisement,
    );
    summaryTotals.totalTax = RoundingUtils.roundForDatabase(
      summaryTotals.totalTax,
    );
    summaryTotals.grandTotal = RoundingUtils.roundForDatabase(
      summaryTotals.grandTotal,
    );

    return {
      body: results,
      footer: summaryTotals,
      totalLocations: results.length,
    };
  }

  /**
   * Applies legacy or ledger/category royalty formulas per location and returns
   * rounded row payloads for the report body.
   */
  private async buildLocationRows(
    locations: AllLocationsReportRawInputs['locations'],
    fromDate: string,
    toDate: string,
  ): Promise<any[]> {
    if (locations.length === 0) {
      return [];
    }

    const inputs = await this.allLocationsReportRepository.getReportInputs(
      locations,
      convertLegacyDateFormat(fromDate),
      convertLegacyDateFormat(toDate),
    );

    const royaltyFreeMap = new Map(
      inputs.paymentBasedData.amounts.map((item) => [
        item.locationId,
        item.royaltyFree,
      ]),
    );

    const categoryRoyaltyMap = new Map<
      number,
      Array<{
        categoryId: number;
        categoryName: string;
        rate: number;
        revenue: number;
        royalty: number;
      }>
    >();
    for (const row of inputs.paymentBasedData.categoryRows) {
      const categories = categoryRoyaltyMap.get(row.locationId) ?? [];
      categories.push({
        ...row,
        revenue: RoundingUtils.roundForDatabase(row.revenue),
        royalty: RoundingUtils.roundForDatabase(row.royalty),
      });
      categoryRoyaltyMap.set(row.locationId, categories);
    }
    for (const categories of categoryRoyaltyMap.values()) {
      categories.sort(
        (a, b) =>
          a.categoryName.localeCompare(b.categoryName) || a.rate - b.rate,
      );
    }

    return locations.map((location) => {
      const activeEnrolmentsCount =
        inputs.enrolmentsByLocationId.get(location.id) || 0;
      const debtData = inputs.debtByLocationId.get(location.id) || {
        royalty: 5,
        advertisement: 3,
      };
      const taxPercentage = Number(
        inputs.taxRateByProvinceId.get(location.provinceId) || 13,
      );
      const useLedgerPath = inputs.locationsWithLedger.has(location.id);

      let revenue: number;
      let royalty: number;
      let advertisement: number;
      let royaltyBreakdown: Array<{
        categoryId: number;
        categoryName: string;
        rate: string;
        revenue: string;
        royalty: string;
      }>;

      if (useLedgerPath) {
        // New category/ledger path for locations with payment-date recognition.
        const royaltyFreeAmount = royaltyFreeMap.get(location.id) || 0;
        const breakdown = categoryRoyaltyMap.get(location.id) || [];
        const categoryRevenue = breakdown.reduce(
          (sum, category) => sum + category.revenue,
          0,
        );
        revenue = categoryRevenue - royaltyFreeAmount;
        royalty = breakdown.reduce((sum, category) => sum + category.royalty, 0);
        advertisement = revenue * (debtData.advertisement / 100);
        royaltyBreakdown = breakdown.map((category) => ({
          categoryId: category.categoryId,
          categoryName: category.categoryName,
          rate: category.rate.toFixed(2),
          revenue: category.revenue.toFixed(2),
          royalty: category.royalty.toFixed(2),
        }));
      } else {
        // Legacy location-rate path so historical months stay as-is.
        const payments =
          inputs.legacyPaymentsByLocationId.get(location.id) || 0;
        const amounts = inputs.legacyAmountsByLocationId.get(location.id) || {
          taxCollected: 0,
          royaltyFreeItems: 0,
        };
        revenue = payments - amounts.taxCollected - amounts.royaltyFreeItems;
        if (revenue > 0) {
          royalty = revenue * (debtData.royalty / 100);
          advertisement = revenue * (debtData.advertisement / 100);
        } else {
          royalty = 0;
          advertisement = 0;
        }
        // Hide empty Lesson row when legacy revenue/royalty are both zero.
        royaltyBreakdown =
          Math.abs(revenue) > 0.01 || Math.abs(royalty) > 0.01
            ? [
                {
                  categoryId: 1,
                  categoryName: 'Lesson',
                  rate: Number(debtData.royalty).toFixed(2),
                  revenue: RoundingUtils.roundForDatabase(revenue).toFixed(2),
                  royalty: RoundingUtils.roundForDatabase(royalty).toFixed(2),
                },
              ]
            : [];
      }

      const subTotal = royalty + advertisement;
      const taxAmount = subTotal * (taxPercentage / 100);
      const total = subTotal + taxAmount;

      return {
        locationId: location.id,
        locationName: location.name,
        activeEnrolments: activeEnrolmentsCount,
        revenue: RoundingUtils.roundForDatabase(revenue),
        royalty: RoundingUtils.roundForDatabase(royalty),
        royaltyBreakdown,
        advertisement: RoundingUtils.roundForDatabase(advertisement),
        total: RoundingUtils.roundForDatabase(total),
        hst: RoundingUtils.roundForDatabase(taxAmount),
      };
    });
  }
}
