import { Injectable } from '@nestjs/common';
import { Location } from '../../location/entities/location.entity';
import { RoundingUtils } from '../../utils/rounding.utils';
import { isPOSFeatureEnabled } from '../../shared/helpers/pos-rollout.helper';
import { formatLegacyDate, parseFlexibleDate } from '../../utils/date-utils';
import { applyHistoricalAdvertisement } from './historical-advertisement';
import {
  LegacyPosRoyaltyAmounts,
  RoyaltyReportLocationContext,
  RoyaltyReportRepository,
} from '../repositories/royalty-report.repository';

export enum RoyaltyReportPresentation {
  ENHANCED = 'enhanced',
  STANDARD = 'standard',
}

/**
 * Builds the location Royalty Report body.
 *
 * Report paths:
 * - standard/owner: legacy calculation with invoice-date tax and the location
 *   royalty percentage applied to complete eligible revenue
 * - enhanced/admin: category rates when PAYMENT_RECEIVED ledger activity or
 *   enabled-location POS activity exists; otherwise historical ranges use Legacy
 *
 * Database access lives in RoyaltyReportRepository.
 */
@Injectable()
export class RoyaltyReportService {
  constructor(
    private readonly royaltyReportRepository: RoyaltyReportRepository,
  ) {}

  /**
   * Normalizes optional start/end inputs to Date values.
   * Defaults both ends to today when omitted.
   */
  private resolveDates(
    startDate?: string,
    endDate?: string,
  ): {
    start: Date;
    end: Date;
  } {
    const today = new Date();
    const parsedStart = parseFlexibleDate(startDate);
    const parsedEnd = parseFlexibleDate(endDate);
    const start = parsedStart ?? new Date(today.toISOString().slice(0, 10));
    const end = parsedEnd ?? new Date(today.toISOString().slice(0, 10));
    return { start, end };
  }

  /**
   * Formats a Date as YYYY-MM-DD for SQL date-range filters.
   */
  private formatDateForQuery(date: Date): string {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  /**
   * Returns a zeroed royalty report payload used when the location is missing.
   */
  private emptyBody(
    advertisementPercent = 0,
    presentation = RoyaltyReportPresentation.ENHANCED,
  ) {
    const body = {
      'Payments Received': '0.00',
      'Gift Card Payments': '0.00',
      'Tax Collected': '0.00',
      'Royalty Free Items': '0.00',
      Revenue: '0.00',
      'Gross Category Revenue': '0.00',
      [presentation === RoyaltyReportPresentation.ENHANCED
        ? 'Advertisement (Category Rates)'
        : `Advertisement (${advertisementPercent}%)`]: '0.00',
      'Royalty (Category Rates)': '0.00',
      'Royalty By Category': [],
      Subtotal: '0.00',
      Tax: '0.00',
      Total: '0.00',
    };

    return this.applyPresentation(body, presentation, 0);
  }

  /**
   * Removes category-only fields from the standard report and displays the
   * location royalty percentage used by its legacy calculation.
   */
  private applyPresentation(
    body: Record<string, unknown>,
    presentation: RoyaltyReportPresentation,
    locationRoyaltyPercent: number,
  ): Record<string, unknown> {
    if (presentation === RoyaltyReportPresentation.ENHANCED) {
      return body;
    }

    return Object.fromEntries(
      Object.entries(body).flatMap(([key, value]) => {
        if (key === 'Gross Category Revenue' || key === 'Royalty By Category') {
          return [];
        }

        if (key === 'Royalty (Category Rates)') {
          return [[`Royalty (${locationRoyaltyPercent}%)`, value]];
        }

        return [[key, value]];
      }),
    );
  }

  /**
   * Builds an empty report response for a missing location.
   */
  private buildEmptyRoyaltyReport(
    start: Date,
    end: Date,
    locationSlug: string,
    presentation: RoyaltyReportPresentation,
  ) {
    return {
      body: this.emptyBody(0, presentation),
      meta: {
        startDate: formatLegacyDate(start),
        endDate: formatLegacyDate(end),
        location: locationSlug,
        calculationMode: 'none',
        ...(presentation === RoyaltyReportPresentation.ENHANCED
          ? {
              collectedTaxBreakdown: {
                nonPos: '0.00',
                pos: '0.00',
                total: '0.00',
              },
            }
          : {}),
      },
    };
  }

  /**
   * Builds one location's royalty report for the resolved date range,
   * choosing the Legacy calculation for the standard presentation and the
   * category calculation for enhanced ranges with ledger or POS activity.
   */
  private async buildRoyaltyReportForLocation(
    location: Location,
    start: Date,
    end: Date,
    presentation = RoyaltyReportPresentation.ENHANCED,
  ) {
    const startStr = this.formatDateForQuery(start);
    const endStr = this.formatDateForQuery(end);

    const context = await this.royaltyReportRepository.getReportContext(
      location,
      startStr,
      endStr,
    );

    const enhancedPresentation =
      presentation === RoyaltyReportPresentation.ENHANCED;
    const posSourceAmounts = enhancedPresentation
      ? await this.royaltyReportRepository.getLegacyPosRoyaltyAmounts(
          context.location.id,
          startStr,
          endStr,
        )
      : { paymentsReceived: 0, taxCollected: 0, royaltyFreeItems: 0 };
    const hasEnabledPOSActivity =
      enhancedPresentation &&
      isPOSFeatureEnabled(context.location.slug) &&
      [
        posSourceAmounts.paymentsReceived,
        posSourceAmounts.taxCollected,
        posSourceAmounts.royaltyFreeItems,
      ].some((amount) => Math.abs(amount) >= 0.005);
    const useLegacyCalculation =
      !enhancedPresentation ||
      (!context.hasLedgerActivity && !hasEnabledPOSActivity);
    const calculation = useLegacyCalculation
      ? {
          body: await this.buildLegacyRoyaltyBody(
            enhancedPresentation
              ? {
                  ...context,
                  advertisementPercent:
                    context.historicalAdvertisementPercent ?? 0,
                }
              : context,
            startStr,
            endStr,
          ),
          collectedTaxBreakdown: undefined,
          advertisementCalculation: undefined,
        }
      : await this.buildNewRoyaltyBody(
          context,
          startStr,
          endStr,
          posSourceAmounts,
        );
    const body = this.applyPresentation(
      calculation.body,
      presentation,
      context.locationRoyaltyPercent,
    );

    return {
      body,
      meta: {
        startDate: formatLegacyDate(start),
        endDate: formatLegacyDate(end),
        location: location.slug,
        calculationMode: useLegacyCalculation ? 'legacy' : 'ledger',
        ...(enhancedPresentation
          ? {
              collectedTaxBreakdown: calculation.collectedTaxBreakdown ?? {
                nonPos: String(body['Tax Collected']),
                pos: '0.00',
                total: String(body['Tax Collected']),
              },
              ...(calculation.advertisementCalculation
                ? { advertisementCalculation: calculation.advertisementCalculation }
                : {}),
            }
          : {}),
      },
    };
  }

  /**
   * Entry point for the location Royalty Report.
   * Owners receive the established Legacy calculation. Administrators receive
   * category calculations for selected ranges with ledger or POS activity.
   */
  async getRoyalty(
    locationSlug: string,
    startDate?: string,
    endDate?: string,
    presentation = RoyaltyReportPresentation.ENHANCED,
  ) {
    const { start, end } = this.resolveDates(startDate, endDate);
    const location =
      await this.royaltyReportRepository.findLocationBySlug(locationSlug);

    if (!location) {
      return this.buildEmptyRoyaltyReport(
        start,
        end,
        locationSlug,
        presentation,
      );
    }

    return this.buildRoyaltyReportForLocation(
      location,
      start,
      end,
      presentation,
    );
  }

  /**
   * Builds royalty reports for every active location in the date range.
   * Standard reports use the legacy formula for every location. Enhanced
   * reports use each location's Legacy/category path independently.
   */
  async getRoyaltyForAllLocations(
    startDate?: string,
    endDate?: string,
    presentation = RoyaltyReportPresentation.ENHANCED,
  ) {
    const { start, end } = this.resolveDates(startDate, endDate);
    const locations = await this.royaltyReportRepository.findActiveLocations();

    const reports = await Promise.all(
      locations.map((location) =>
        this.buildRoyaltyReportForLocation(location, start, end, presentation),
      ),
    );

    return {
      body: reports,
      meta: {
        startDate: formatLegacyDate(start),
        endDate: formatLegacyDate(end),
        totalLocations: reports.length,
      },
    };
  }

  /**
   * Legacy royalty formula (SMW-Legacy compatible).
   *
   * Revenue = Payments − TaxCollected − RoyaltyFreeItems
   * Royalty = Revenue × location royalty %
   * Advertisement = Revenue × location advertisement %
   *
   * Used when the selected range has no payment-date ledger recognition so
   * existing/historical royalty totals stay as-is.
   */
  private async buildLegacyRoyaltyBody(
    context: RoyaltyReportLocationContext,
    startStr: string,
    endStr: string,
  ) {
    const legacyAmounts = await this.royaltyReportRepository.getLegacyAmounts(
      context.location.id,
      startStr,
      endStr,
    );

    const round2 = (v: number) => RoundingUtils.roundHalfUp(v);
    const taxCollected = round2(legacyAmounts.taxCollected);
    const royaltyFree = round2(legacyAmounts.royaltyFreeItems);
    const revenue = round2(context.payments - taxCollected - royaltyFree);

    let royaltyAmount = 0;
    let advertisementAmount = 0;
    if (revenue > 0) {
      royaltyAmount = round2(revenue * (context.locationRoyaltyPercent / 100));
      advertisementAmount = round2(
        revenue * (context.advertisementPercent / 100),
      );
    }

    const subtotal = round2(royaltyAmount + advertisementAmount);
    const taxOnRoyalty = round2(subtotal * (context.taxPercent / 100));
    const total = round2(subtotal + taxOnRoyalty);

    return {
      'Payments Received': context.payments.toFixed(2),
      'Gift Card Payments': context.giftCardPayments.toFixed(2),
      'Tax Collected': taxCollected.toFixed(2),
      'Royalty Free Items': royaltyFree.toFixed(2),
      Revenue: revenue.toFixed(2),
      'Gross Category Revenue': revenue.toFixed(2),
      [`Advertisement (${context.advertisementPercent}%)`]:
        advertisementAmount.toFixed(2),
      [`Royalty (${context.locationRoyaltyPercent}%)`]:
        royaltyAmount.toFixed(2),
      // Hide empty Lesson row on zero-revenue days; keep summary totals at $0.
      'Royalty By Category':
        Math.abs(revenue) > 0.01 || Math.abs(royaltyAmount) > 0.01
          ? [
              {
                categoryId: 1,
                categoryName: 'Lesson',
                type: 'Lesson',
                rate: context.locationRoyaltyPercent.toFixed(2),
                advertisementRate: context.advertisementPercent.toFixed(2),
                advertisement: advertisementAmount.toFixed(2),
                royaltyFree: false,
                revenue: revenue.toFixed(2),
                royalty: royaltyAmount.toFixed(2),
              },
            ]
          : [],
      Subtotal: subtotal.toFixed(2),
      Tax: taxOnRoyalty.toFixed(2),
      Total: total.toFixed(2),
    };
  }

  /**
   * New category/ledger royalty formula.
   *
   * Uses payment-dated category revenue and frozen category rates (plus ledger
   * rows when present). Applied when the range has PAYMENT_RECEIVED ledger
   * activity or enabled-location POS payment activity.
   */
  private async buildNewRoyaltyBody(
    context: RoyaltyReportLocationContext,
    startStr: string,
    endStr: string,
    posSourceAmounts: LegacyPosRoyaltyAmounts,
  ) {
    const includePOS = isPOSFeatureEnabled(context.location.slug);
    const paymentBasedData =
      await this.royaltyReportRepository.getPaymentBasedRoyaltyData(
        context.location.id,
        startStr,
        endStr,
        includePOS,
      );

    const categoryRoyalties = paymentBasedData.categoryRows
      .map((row) => ({
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        type: row.type,
        royaltyRate: row.rate,
        advertisementRate: row.advertisementRate ?? 0,
        advertisement: RoundingUtils.roundHalfUp(row.advertisement ?? 0),
        historicalAdvertisementRevenue: row.historicalAdvertisementRevenue ?? 0,
        historicalAdvertisementFreeRevenue: row.historicalAdvertisementFreeRevenue ?? 0,
        royaltyFree: row.royaltyFree,
        revenue: RoundingUtils.roundHalfUp(row.revenue),
        royalty: RoundingUtils.roundHalfUp(row.royalty),
      }))
      .sort(
        (a, b) =>
          a.categoryName.localeCompare(b.categoryName) ||
          a.type.localeCompare(b.type) ||
          Number(a.royaltyFree) - Number(b.royaltyFree) ||
          a.royaltyRate - b.royaltyRate ||
          a.advertisementRate - b.advertisementRate,
      );

    const advertisementCalculation = applyHistoricalAdvertisement(
      categoryRoyalties,
      context.historicalAdvertisementPercent ?? 0,
    );

    const paymentBasedAmounts = paymentBasedData.amounts.find(
      (row) => row.locationId === context.location.id,
    );
    const recognizedTaxNum = RoundingUtils.roundHalfUp(
      paymentBasedAmounts?.tax || 0,
    );
    const posTaxNum = RoundingUtils.roundHalfUp(
      paymentBasedAmounts?.posTax || 0,
    );
    const royaltyFreeAmountNum = RoundingUtils.roundHalfUp(
      paymentBasedAmounts?.royaltyFree || 0,
    );
    const posPaymentsNum = RoundingUtils.roundHalfUp(
      posSourceAmounts.paymentsReceived,
    );
    // Payment totals include POS activity only where the POS rollout is enabled.
    // Tax and royalty-free totals already follow that gate in the category query.
    const paymentsReceivedNum = RoundingUtils.roundHalfUp(
      includePOS ? context.payments : context.payments - posPaymentsNum,
    );
    const categoryRevenueNum = categoryRoyalties.reduce(
      (sum, category) => sum + category.revenue,
      0,
    );
    const categoryRoyaltyNum = categoryRoyalties.reduce(
      (sum, category) => sum + category.royalty,
      0,
    );
    const visibleCategoryRoyalties = categoryRoyalties.filter(
      (category) =>
        Math.abs(category.revenue) >= 0.005 ||
        Math.abs(category.royalty) >= 0.005 ||
        Math.abs(category.advertisement) >= 0.005,
    );

    const round2 = (v: number) => RoundingUtils.roundHalfUp(v);
    const toCents = (v: number) => RoundingUtils.roundHalfUp(v * 100, 0);
    const fromCents = (c: number) => c / 100;

    // Gross category revenue includes royalty-free rows for auditability.
    // Revenue removes those rows before advertisement and royalty fees.
    const revenueNum = categoryRevenueNum - royaltyFreeAmountNum;
    const advertisementCents = categoryRoyalties.reduce(
      (sum, category) => sum + toCents(category.advertisement),
      0,
    );
    const royaltyCents = toCents(categoryRoyaltyNum);
    const subtotalCents = advertisementCents + royaltyCents;
    const taxCents = RoundingUtils.roundHalfUp(
      subtotalCents * (context.taxPercent / 100),
      0,
    );
    const totalCents = subtotalCents + taxCents;

    const body = {
      'Payments Received': paymentsReceivedNum.toFixed(2),
      'Gift Card Payments': context.giftCardPayments.toFixed(2),
      'Tax Collected': recognizedTaxNum.toFixed(2),
      'Royalty Free Items': royaltyFreeAmountNum.toFixed(2),
      'Gross Category Revenue': round2(categoryRevenueNum).toFixed(2),
      Revenue: round2(revenueNum).toFixed(2),
      ['Advertisement (Category Rates)']: round2(
        fromCents(advertisementCents),
      ).toFixed(2),
      'Royalty (Category Rates)': round2(fromCents(royaltyCents)).toFixed(2),
      'Royalty By Category': visibleCategoryRoyalties.map((category) => ({
        categoryId: category.categoryId,
        categoryName: category.categoryName,
        type: category.type,
        rate: category.royaltyRate.toFixed(2),
        advertisementRate: category.advertisementRate.toFixed(2),
        advertisement: category.advertisement.toFixed(2),
        royaltyFree: category.royaltyFree,
        revenue: category.revenue.toFixed(2),
        royalty: category.royalty.toFixed(2),
      })),
      Subtotal: round2(fromCents(subtotalCents)).toFixed(2),
      Tax: round2(fromCents(taxCents)).toFixed(2),
      Total: round2(fromCents(totalCents)).toFixed(2),
    };

    return {
      body,
      advertisementCalculation,
      // Informational metadata only. Keep report charges and tax recognition
      // unchanged, using the same source events and POS rollout filters.
      collectedTaxBreakdown: {
        nonPos: round2(recognizedTaxNum - posTaxNum).toFixed(2),
        pos: posTaxNum.toFixed(2),
        total: recognizedTaxNum.toFixed(2),
      },
    };
  }
}
