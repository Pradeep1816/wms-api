import { Injectable } from '@nestjs/common';
import { Location } from '../../location/entities/location.entity';
import { formatLegacyDate, parseFlexibleDate } from '../../utils/date-utils';
import { RoundingUtils } from '../../utils/rounding.utils';
import {
  RoyaltyReportLocationContext,
  RoyaltyReportRepository,
} from '../repositories/royalty-report.repository';
import { RoyaltyComparisonRepository } from '../repositories/royalty-comparison.repository';
import { isPOSFeatureEnabled } from '../../shared/helpers/pos-rollout.helper';

/**
 * Supplies temporary, read-only comparison data without changing the Phase 1
 * royalty calculation path used by RoyaltyReportService.
 */
@Injectable()
export class RoyaltyComparisonService {
  constructor(
    private readonly royaltyReportRepository: RoyaltyReportRepository,
    private readonly royaltyComparisonRepository: RoyaltyComparisonRepository,
  ) {}

  async getLegacyReport(
    locationSlug: string,
    startDate?: string,
    endDate?: string,
  ) {
    const { start, end } = this.resolveDates(startDate, endDate);
    const location =
      await this.royaltyReportRepository.findLocationBySlug(locationSlug);

    if (!location) {
      return {
        body: this.emptyLegacyBody(isPOSFeatureEnabled(locationSlug)),
        meta: {
          startDate: formatLegacyDate(start),
          endDate: formatLegacyDate(end),
          location: locationSlug,
          calculationMode: 'legacy',
        },
      };
    }

    return this.buildLegacyReportForLocation(location, start, end);
  }

  async getLegacyReportForAllLocations(startDate?: string, endDate?: string) {
    const { start, end } = this.resolveDates(startDate, endDate);
    const locations = await this.royaltyReportRepository.findActiveLocations();
    const body = await Promise.all(
      locations.map((location) =>
        this.buildLegacyReportForLocation(location, start, end),
      ),
    );

    return {
      body,
      meta: {
        startDate: formatLegacyDate(start),
        endDate: formatLegacyDate(end),
        totalLocations: body.length,
      },
    };
  }

  async getUnclassifiedHistoricalCredits(
    locationSlug: string,
    startDate?: string,
    endDate?: string,
  ) {
    const { start, end } = this.resolveDates(startDate, endDate);
    const startStr = this.formatDateForQuery(start);
    const endStr = this.formatDateForQuery(end);
    const location =
      await this.royaltyReportRepository.findLocationBySlug(locationSlug);

    if (!location) {
      return {
        body: this.emptyUnclassifiedCredits(),
        meta: {
          startDate: formatLegacyDate(start),
          endDate: formatLegacyDate(end),
          location: locationSlug,
        },
      };
    }

    const [context, credits] = await Promise.all([
      this.royaltyReportRepository.getReportContext(location, startStr, endStr),
      this.royaltyComparisonRepository.getUnclassifiedHistoricalCredits(
        location.id,
        startStr,
        endStr,
      ),
    ]);
    const totalAmount = RoundingUtils.roundHalfUp(credits.totalAmount);
    const estimatedRoyalty = RoundingUtils.roundHalfUp(
      totalAmount * (context.locationRoyaltyPercent / 100),
    );

    return {
      body: {
        count: credits.count,
        totalAmount: totalAmount.toFixed(2),
        proposedCategory: 'Lesson',
        proposedRate: context.locationRoyaltyPercent.toFixed(2),
        estimatedRoyalty: estimatedRoyalty.toFixed(2),
        hasMore: credits.hasMore,
        items: credits.items.map((item) => ({
          ...item,
          amount: RoundingUtils.roundHalfUp(item.amount).toFixed(2),
        })),
      },
      meta: {
        startDate: formatLegacyDate(start),
        endDate: formatLegacyDate(end),
        location: location.slug,
      },
    };
  }

  private async buildLegacyReportForLocation(
    location: Location,
    start: Date,
    end: Date,
  ) {
    const startStr = this.formatDateForQuery(start);
    const endStr = this.formatDateForQuery(end);
    const context = await this.royaltyReportRepository.getReportContext(
      location,
      startStr,
      endStr,
    );
    const body = await this.buildLegacyBody(context, startStr, endStr);

    return {
      body,
      meta: {
        startDate: formatLegacyDate(start),
        endDate: formatLegacyDate(end),
        location: location.slug,
        calculationMode: 'legacy',
      },
    };
  }

  /**
   * Historical formula:
   * Revenue = Payments Received - Tax Collected - Royalty Free Items.
   */
  private async buildLegacyBody(
    context: RoyaltyReportLocationContext,
    startDate: string,
    endDate: string,
  ) {
    const includePOS = isPOSFeatureEnabled(context.location.slug);
    const [amounts, posAmounts] = await Promise.all([
      this.royaltyReportRepository.getLegacyAmounts(
        context.location.id,
        startDate,
        endDate,
      ),
      includePOS
        ? this.royaltyReportRepository.getLegacyPosRoyaltyAmounts(
            context.location.id,
            startDate,
            endDate,
          )
        : Promise.resolve({
            paymentsReceived: 0,
            taxCollected: 0,
            royaltyFreeItems: 0,
          }),
    ]);
    const round = (value: number) => RoundingUtils.roundHalfUp(value);
    const posPaymentsReceived = round(posAmounts.paymentsReceived);
    const paymentsReceived = round(context.payments - posPaymentsReceived);
    const taxCollected = round(amounts.taxCollected);
    const posTaxCollected = round(posAmounts.taxCollected);
    const royaltyFreeItems = round(amounts.royaltyFreeItems);
    const posRoyaltyFreeItems = round(posAmounts.royaltyFreeItems);
    const revenue = round(
      context.payments -
        taxCollected -
        posTaxCollected -
        royaltyFreeItems -
        posRoyaltyFreeItems,
    );
    // Legacy exposes one royalty percentage from Location Settings. Keep the
    // displayed equation reconcilable by applying that rate to all eligible
    // revenue, including POS. Per-category POS snapshots are New Report data.
    const royalty = round(revenue * (context.locationRoyaltyPercent / 100));
    const advertisement = round(revenue * (context.advertisementPercent / 100));
    const subtotal = round(royalty + advertisement);
    const tax = round(subtotal * (context.taxPercent / 100));
    const total = round(subtotal + tax);

    return {
      'Payments Received': paymentsReceived.toFixed(2),
      ...(includePOS
        ? { 'Payments Received from POS': posPaymentsReceived.toFixed(2) }
        : {}),
      'Gift Card Payments': context.giftCardPayments.toFixed(2),
      'Tax Collected': taxCollected.toFixed(2),
      ...(includePOS
        ? { 'Tax Collected from POS': posTaxCollected.toFixed(2) }
        : {}),
      'Royalty Free Items': royaltyFreeItems.toFixed(2),
      ...(includePOS
        ? { 'Royalty Free Items from POS': posRoyaltyFreeItems.toFixed(2) }
        : {}),
      Revenue: revenue.toFixed(2),
      [`Advertisement (${context.advertisementPercent}%)`]:
        advertisement.toFixed(2),
      [`Royalty (${context.locationRoyaltyPercent}%)`]: royalty.toFixed(2),
      Subtotal: subtotal.toFixed(2),
      Tax: tax.toFixed(2),
      Total: total.toFixed(2),
    };
  }

  private emptyLegacyBody(includePOS = false) {
    return {
      'Payments Received': '0.00',
      ...(includePOS ? { 'Payments Received from POS': '0.00' } : {}),
      'Gift Card Payments': '0.00',
      'Tax Collected': '0.00',
      ...(includePOS ? { 'Tax Collected from POS': '0.00' } : {}),
      'Royalty Free Items': '0.00',
      ...(includePOS ? { 'Royalty Free Items from POS': '0.00' } : {}),
      Revenue: '0.00',
      'Advertisement (0%)': '0.00',
      'Royalty (0%)': '0.00',
      Subtotal: '0.00',
      Tax: '0.00',
      Total: '0.00',
    };
  }

  private emptyUnclassifiedCredits() {
    return {
      count: 0,
      totalAmount: '0.00',
      proposedCategory: 'Lesson',
      proposedRate: '0.00',
      estimatedRoyalty: '0.00',
      hasMore: false,
      items: [],
    };
  }

  private resolveDates(startDate?: string, endDate?: string) {
    const today = new Date();
    const start =
      parseFlexibleDate(startDate) ??
      new Date(today.toISOString().slice(0, 10));
    const end =
      parseFlexibleDate(endDate) ?? new Date(today.toISOString().slice(0, 10));
    return { start, end };
  }

  private formatDateForQuery(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
}
