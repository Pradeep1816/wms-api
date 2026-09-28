import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { Location } from '../../location/entities/location.entity';
import { LocationDebt } from '../../location/entities/location-debt.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { RoyaltyTransaction } from '../../payment/entities/royalty-transaction.entity';
import { RoyaltyTransactionEventType } from '../../payment/enums/royalty-transaction.enum';
import { TaxCode } from '../../tax/entities/tax-code.entity';
import { User } from '../../user/entities/user.entity';
import { UserLocation } from '../../user/entities/user-location.entity';
import {
  PaymentBasedRoyaltyData,
  PaymentBasedRoyaltyReportRepository,
} from './payment-based-royalty-report.repository';

/**
 * Invoice-date tax and royalty-free totals used by the legacy royalty formula:
 * Revenue = Payments − TaxCollected − RoyaltyFreeItems.
 */
export interface LegacyRoyaltyAmounts {
  taxCollected: number;
  royaltyFreeItems: number;
}

/**
 * Paid POS source amounts shown separately in the legacy comparison report.
 * Royalty is deliberately not calculated here: Legacy has one displayed
 * location rate, which the service applies to all eligible revenue. POS
 * category snapshot rates belong to the New Report only.
 */
export interface LegacyPosRoyaltyAmounts {
  paymentsReceived: number;
  taxCollected: number;
  royaltyFreeItems: number;
}

interface LegacyPosRoyaltyRawRow {
  paymentsReceived: string | number | null;
  taxCollected: string | number | null;
  royaltyFreeItems: string | number | null;
}
/**
 * Shared location inputs for both legacy and ledger/category royalty paths.
 * `hasLedgerActivity` decides which formula the service applies.
 */
export interface RoyaltyReportLocationContext {
  location: Location;
  advertisementPercent: number;
  historicalAdvertisementPercent?: number;
  locationRoyaltyPercent: number;
  taxPercent: number;
  payments: number;
  giftCardPayments: number;
  hasLedgerActivity: boolean;
}

/**
 * Database access for the location Royalty Report.
 *
 * Keeps all queries here so RoyaltyReportService stays limited to business
 * formulas (legacy single location-rate vs category/ledger recognition).
 */
@Injectable()
export class RoyaltyReportRepository {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(TaxCode)
    private readonly taxCodeRepository: Repository<TaxCode>,
    @InjectRepository(LocationDebt)
    private readonly locationDebtRepository: Repository<LocationDebt>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem)
    private readonly invoiceLineItemRepository: Repository<InvoiceLineItem>,
    @InjectRepository(RoyaltyTransaction)
    private readonly royaltyTransactionRepository: Repository<RoyaltyTransaction>,
    private readonly paymentBasedRoyaltyReportRepository: PaymentBasedRoyaltyReportRepository,
  ) {}

  /**
   * Loads a location by slug for royalty report scoping.
   */
  async findLocationBySlug(locationSlug: string): Promise<Location | null> {
    return this.locationRepository.findOne({
      where: { slug: locationSlug, isDeleted: false },
    });
  }

  /**
   * Loads all active locations for the multi-location royalty report endpoint.
   */
  async findActiveLocations(): Promise<Location[]> {
    return this.locationRepository.find({
      where: { isDeleted: false },
      order: { name: 'ASC' },
    });
  }

  /**
   * Loads payments, gift-card payments, ad/royalty/tax rates, and whether the
   * selected date range already has payment-date ledger recognition.
   */
  async getReportContext(
    location: Location,
    startDate: string,
    endDate: string,
  ): Promise<RoyaltyReportLocationContext> {
    const [
      payments,
      giftCardPayments,
      advDebt,
      royaltyDebt,
      taxCode,
      hasLedgerActivity,
    ] = await Promise.all([
      this.sumPayments(location.id, startDate, endDate, false),
      this.sumPayments(location.id, startDate, endDate, true),
      this.locationDebtRepository.findOne({
        where: {
          locationId: location.id,
          type: LocationDebt.TYPE_ADVERTISEMENT,
        },
      }),
      this.locationDebtRepository.findOne({
        where: {
          locationId: location.id,
          type: LocationDebt.TYPE_ROYALTY,
        },
      }),
      this.taxCodeRepository
        .createQueryBuilder('taxCode')
        .where('taxCode.province_id = :provinceId', {
          provinceId: location.provinceId,
        })
        .andWhere('taxCode.tax_type_id = :taxTypeId', { taxTypeId: 1 })
        .orderBy('taxCode.id', 'DESC')
        .getOne(),
      this.hasLedgerActivity(location.id, startDate, endDate),
    ]);

    return {
      location,
      advertisementPercent: Number(advDebt?.value || 0),
      historicalAdvertisementPercent: Number(
        advDebt?.advertisementBaseline ?? 0,
      ),
      locationRoyaltyPercent: Number(royaltyDebt?.value || 0),
      taxPercent: Number(taxCode?.rate || 0),
      payments,
      giftCardPayments,
      hasLedgerActivity,
    };
  }

  async getEligiblePayments(
    locationId: number,
    startDate: string,
    endDate: string,
  ): Promise<number> {
    return this.sumPayments(locationId, startDate, endDate, false);
  }

  /**
   * Returns true when the range contains PAYMENT_RECEIVED royalty_transaction
   * rows. Those periods use the new category/ledger report path; otherwise the
   * legacy location-rate path is used so historical months stay as-is.
   */
  async hasLedgerActivity(
    locationId: number,
    startDate: string,
    endDate: string,
  ): Promise<boolean> {
    const count = await this.royaltyTransactionRepository
      .createQueryBuilder('royaltyTransaction')
      .where('royaltyTransaction.locationId = :locationId', { locationId })
      .andWhere('royaltyTransaction.eventType = :eventType', {
        eventType: RoyaltyTransactionEventType.PAYMENT_RECEIVED,
      })
      .andWhere(
        'DATE(royaltyTransaction.effectiveDate) BETWEEN :startDate AND :endDate',
        { startDate, endDate },
      )
      .getCount();
    return count > 0;
  }

  /**
   * Loads legacy Tax Collected and Royalty Free Items for a date range.
   *
   * Matches SMW-Legacy ReportController::actionRoyalty:
   * - Tax = SUM(invoice.tax) by invoice date
   * - Royalty free = SUM(line netTotal) for royaltyFree lines by invoice date
   *
   * Do not use payment-attributed tax here; that belongs to the new path only.
   */
  async getLegacyAmounts(
    locationId: number,
    startDate: string,
    endDate: string,
  ): Promise<LegacyRoyaltyAmounts> {
    const taxRow = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .select('COALESCE(SUM(invoice.tax), 0)', 'tax')
      .where('invoice.locationId = :locationId', { locationId })
      .andWhere('invoice.type = :type', { type: Invoice.TYPE_INVOICE })
      .andWhere('invoice.isDeleted = 0')
      .andWhere('DATE(invoice.date) BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getRawOne<{ tax: string | number }>();

    const royaltyFreeRow = await this.invoiceLineItemRepository
      .createQueryBuilder('lineItem')
      .innerJoin('lineItem.invoice', 'invoice')
      .select('COALESCE(SUM(lineItem.netTotal), 0)', 'royaltyFree')
      .where('invoice.locationId = :locationId', { locationId })
      .andWhere('invoice.type = :type', { type: Invoice.TYPE_INVOICE })
      .andWhere('invoice.isDeleted = 0')
      .andWhere('lineItem.isDeleted = 0')
      .andWhere('lineItem.royaltyFree = 1')
      .andWhere('DATE(invoice.date) BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getRawOne<{ royaltyFree: string | number }>();

    return {
      taxCollected: Number(taxRow?.tax || 0),
      royaltyFreeItems: Number(royaltyFreeRow?.royaltyFree || 0),
    };
  }

  /**
   * Loads paid POS payment, tax, and royalty-free source amounts for Legacy.
   * It intentionally does not calculate category-rate royalty. Transaction
   * discounts are still allocated across lines to identify the royalty-free
   * portion correctly.
   */
  async getLegacyPosRoyaltyAmounts(
    locationId: number,
    startDate: string,
    endDate: string,
  ): Promise<LegacyPosRoyaltyAmounts> {
    const excludedPaymentMethods = [
      PaymentMethod.TYPE_ACCOUNT_ENTRY,
      PaymentMethod.TYPE_CREDIT_USED,
      PaymentMethod.TYPE_CREDIT_APPLIED,
      PaymentMethod.TYPE_GIFT_CARD,
    ];
    const methodPlaceholders = excludedPaymentMethods.map(() => '?').join(', ');
    const lineRevenue = `
      ((COALESCE(posLine.overridePrice, posLine.price) * posLine.quantity) - posLine.discount)
      - CASE
          WHEN pos.subtotal > 0 THEN
            (((COALESCE(posLine.overridePrice, posLine.price) * posLine.quantity) - posLine.discount) / pos.subtotal)
            * pos.discountAmount
          ELSE 0
        END
    `;

    // Keep the original sale in its payment period and recognize a refund as
    // a matching negative event on the refund payment date. A void has no
    // active payment, so it contributes neither event.
    const rows = await this.paymentRepository.manager.query<
      LegacyPosRoyaltyRawRow[]
    >(
      `
        SELECT
          COALESCE(SUM(transactionAmounts.paymentsReceived), 0) AS paymentsReceived,
          COALESCE(SUM(transactionAmounts.taxCollected), 0) AS taxCollected,
          COALESCE(SUM(transactionAmounts.royaltyFreeItems), 0) AS royaltyFreeItems
        FROM (
          SELECT
            pos.id,
            posEvent.direction,
            pos.totalAmount * posEvent.direction AS paymentsReceived,
            pos.tax * posEvent.direction AS taxCollected,
            SUM(
              CASE
                WHEN COALESCE(posLine.royaltyFreeSnapshot, posItem.royaltyFree, 0) = 1
                  THEN (${lineRevenue}) * posEvent.direction
                ELSE 0
              END
            ) AS royaltyFreeItems
          FROM (
            SELECT id AS posId, paymentId AS eventPaymentId, 1 AS direction
            FROM pos_transaction
            WHERE status IN ('PAID', 'REFUNDED')
            UNION ALL
            SELECT id AS posId, refundPaymentId AS eventPaymentId, -1 AS direction
            FROM pos_transaction
            WHERE status = 'REFUNDED' AND refundPaymentId IS NOT NULL
          ) posEvent
          INNER JOIN pos_transaction pos ON pos.id = posEvent.posId
          INNER JOIN pos_transaction_line_item posLine
            ON posLine.posTransactionId = pos.id
          INNER JOIN item posItem ON posItem.id = posLine.itemId
          INNER JOIN payment posPayment
            ON posPayment.id = posEvent.eventPaymentId
           AND posPayment.isDeleted = 0
          WHERE pos.locationId = ?
            AND posPayment.payment_method_id NOT IN (${methodPlaceholders})
            AND DATE(posPayment.date) BETWEEN ? AND ?
          GROUP BY pos.id, posEvent.direction, posEvent.eventPaymentId, pos.tax
        ) transactionAmounts
      `,
      [locationId, ...excludedPaymentMethods, startDate, endDate],
    );
    const row = rows[0];

    return {
      paymentsReceived: Number(row?.paymentsReceived || 0),
      taxCollected: Number(row?.taxCollected || 0),
      royaltyFreeItems: Number(row?.royaltyFreeItems || 0),
    };
  }
  /**
   * Loads category revenue/royalty plus payment-attributed tax and royalty-free
   * amounts for the new (ledger/category) royalty report path.
   */
  async getPaymentBasedRoyaltyData(
    locationId: number,
    startDate: string,
    endDate: string,
    includePOS = true,
  ): Promise<PaymentBasedRoyaltyData> {
    return this.paymentBasedRoyaltyReportRepository.getPaymentBasedRoyaltyData(
      [locationId],
      startDate,
      endDate,
      includePOS,
    );
  }

  /**
   * Batch payment-based royalty data for many locations (All Locations report).
   */
  async getPaymentBasedRoyaltyDataForLocations(
    locationIds: number[],
    startDate: string,
    endDate: string,
  ): Promise<PaymentBasedRoyaltyData> {
    return this.paymentBasedRoyaltyReportRepository.getPaymentBasedRoyaltyData(
      locationIds,
      startDate,
      endDate,
    );
  }

  /**
   * Returns location IDs that have PAYMENT_RECEIVED ledger rows in the range.
   * Used by All Locations to choose legacy vs ledger path per location.
   */
  async getLocationIdsWithLedgerActivity(
    locationIds: number[],
    startDate: string,
    endDate: string,
  ): Promise<Set<number>> {
    if (locationIds.length === 0) {
      return new Set();
    }
    const rows = await this.royaltyTransactionRepository
      .createQueryBuilder('royaltyTransaction')
      .select('DISTINCT royaltyTransaction.locationId', 'locationId')
      .where('royaltyTransaction.locationId IN (:...locationIds)', {
        locationIds,
      })
      .andWhere('royaltyTransaction.eventType = :eventType', {
        eventType: RoyaltyTransactionEventType.PAYMENT_RECEIVED,
      })
      .andWhere(
        'DATE(royaltyTransaction.effectiveDate) BETWEEN :startDate AND :endDate',
        { startDate, endDate },
      )
      .getRawMany<{ locationId: string | number }>();

    return new Set(rows.map((row) => Number(row.locationId)));
  }

  /**
   * Batch legacy tax + royalty-free totals keyed by locationId.
   */
  async getBatchLegacyAmounts(
    locationIds: number[],
    startDate: string,
    endDate: string,
  ): Promise<Map<number, LegacyRoyaltyAmounts>> {
    const result = new Map<number, LegacyRoyaltyAmounts>();
    if (locationIds.length === 0) {
      return result;
    }

    for (const locationId of locationIds) {
      result.set(locationId, { taxCollected: 0, royaltyFreeItems: 0 });
    }

    const taxRows = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .select('invoice.locationId', 'locationId')
      .addSelect('COALESCE(SUM(invoice.tax), 0)', 'tax')
      .where('invoice.locationId IN (:...locationIds)', { locationIds })
      .andWhere('invoice.type = :type', { type: Invoice.TYPE_INVOICE })
      .andWhere('invoice.isDeleted = 0')
      .andWhere('DATE(invoice.date) BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy('invoice.locationId')
      .getRawMany<{ locationId: string | number; tax: string | number }>();

    for (const row of taxRows) {
      const locationId = Number(row.locationId);
      const current = result.get(locationId) || {
        taxCollected: 0,
        royaltyFreeItems: 0,
      };
      current.taxCollected = Number(row.tax || 0);
      result.set(locationId, current);
    }

    const royaltyFreeRows = await this.invoiceLineItemRepository
      .createQueryBuilder('lineItem')
      .innerJoin('lineItem.invoice', 'invoice')
      .select('invoice.locationId', 'locationId')
      .addSelect('COALESCE(SUM(lineItem.netTotal), 0)', 'royaltyFree')
      .where('invoice.locationId IN (:...locationIds)', { locationIds })
      .andWhere('invoice.type = :type', { type: Invoice.TYPE_INVOICE })
      .andWhere('invoice.isDeleted = 0')
      .andWhere('lineItem.isDeleted = 0')
      .andWhere('lineItem.royaltyFree = 1')
      .andWhere('DATE(invoice.date) BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy('invoice.locationId')
      .getRawMany<{
        locationId: string | number;
        royaltyFree: string | number;
      }>();

    for (const row of royaltyFreeRows) {
      const locationId = Number(row.locationId);
      const current = result.get(locationId) || {
        taxCollected: 0,
        royaltyFreeItems: 0,
      };
      current.royaltyFreeItems = Number(row.royaltyFree || 0);
      result.set(locationId, current);
    }

    return result;
  }

  /**
   * Batch eligible payment totals keyed by locationId (excludes credit/gift-card methods).
   */
  async getBatchPaymentTotals(
    locationIds: number[],
    startDate: string,
    endDate: string,
  ): Promise<Map<number, number>> {
    const result = new Map<number, number>();
    if (locationIds.length === 0) {
      return result;
    }

    for (const locationId of locationIds) {
      result.set(locationId, 0);
    }

    const rows = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('location.id', 'locationId')
      .addSelect('COALESCE(SUM(payment.amount), 0)', 'sum')
      .innerJoin(User, 'user', 'user.id = payment.user_id')
      .innerJoin(UserLocation, 'userLocation', 'userLocation.user_id = user.id')
      .innerJoin(Location, 'location', 'location.id = userLocation.location_id')
      .where('payment.isDeleted = false')
      .andWhere('location.id IN (:...locationIds)', { locationIds })
      .andWhere('payment.paymentMethodId NOT IN (:...excludedMethods)', {
        excludedMethods: [
          PaymentMethod.TYPE_ACCOUNT_ENTRY,
          PaymentMethod.TYPE_CREDIT_USED,
          PaymentMethod.TYPE_CREDIT_APPLIED,
          PaymentMethod.TYPE_GIFT_CARD,
        ],
      })
      .andWhere('DATE(payment.date) BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      })
      .groupBy('location.id')
      .getRawMany<{ locationId: string | number; sum: string | number }>();

    for (const row of rows) {
      result.set(Number(row.locationId), Number(row.sum || 0));
    }
    return result;
  }

  /**
   * Sums location payments in the date range.
   * When giftCardOnly is false, excludes account-entry, credit, and gift-card methods.
   * When giftCardOnly is true, returns gift-card payments only.
   */
  private async sumPayments(
    locationId: number,
    startDate: string,
    endDate: string,
    giftCardOnly: boolean,
  ): Promise<number> {
    const query = this.paymentRepository
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.amount), 0)', 'sum')
      .innerJoin(User, 'user', 'user.id = payment.user_id')
      .innerJoin(UserLocation, 'userLocation', 'userLocation.user_id = user.id')
      .innerJoin(Location, 'location', 'location.id = userLocation.location_id')
      .where('payment.isDeleted = false')
      .andWhere('location.id = :locationId', { locationId })
      .andWhere('DATE(payment.date) BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });

    if (giftCardOnly) {
      query.andWhere('payment.paymentMethodId = :giftCard', {
        giftCard: PaymentMethod.TYPE_GIFT_CARD,
      });
    } else {
      query.andWhere('payment.paymentMethodId NOT IN (:...excludedMethods)', {
        excludedMethods: [
          PaymentMethod.TYPE_ACCOUNT_ENTRY,
          PaymentMethod.TYPE_CREDIT_USED,
          PaymentMethod.TYPE_CREDIT_APPLIED,
          PaymentMethod.TYPE_GIFT_CARD,
        ],
      });
    }

    const row = await query.getRawOne<{ sum: string | number }>();
    return Number(row?.sum || 0);
  }
}
