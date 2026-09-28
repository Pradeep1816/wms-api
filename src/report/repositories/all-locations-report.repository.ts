import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Course } from '../../course/entities/course.entity';
import { Location } from '../../location/entities/location.entity';
import { LocationDebt } from '../../location/entities/location-debt.entity';
import { TaxCode } from '../../tax/entities/tax-code.entity';
import {
  LegacyRoyaltyAmounts,
  RoyaltyReportRepository,
} from './royalty-report.repository';
import { PaymentBasedRoyaltyData } from './payment-based-royalty-report.repository';

export interface AllLocationsReportRawInputs {
  locations: Location[];
  enrolmentsByLocationId: Map<number, number>;
  debtByLocationId: Map<number, { royalty: number; advertisement: number }>;
  taxRateByProvinceId: Map<number, number>;
  locationsWithLedger: Set<number>;
  paymentBasedData: PaymentBasedRoyaltyData;
  legacyPaymentsByLocationId: Map<number, number>;
  legacyAmountsByLocationId: Map<number, LegacyRoyaltyAmounts>;
}

/**
 * Database access for the All Locations report.
 * Royalty dual-path queries are delegated to RoyaltyReportRepository.
 * Financial formulas stay in LocationReportService.
 */
@Injectable()
export class AllLocationsReportRepository {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(LocationDebt)
    private readonly locationDebtRepository: Repository<LocationDebt>,
    @InjectRepository(TaxCode)
    private readonly taxCodeRepository: Repository<TaxCode>,
    private readonly royaltyReportRepository: RoyaltyReportRepository,
  ) {}

  /**
   * Loads active locations for the All Locations report (excludes default location id 1).
   */
  async findReportLocations(): Promise<Location[]> {
    return this.locationRepository
      .createQueryBuilder('location')
      .where('location.isDeleted = false')
      .andWhere('location.id != :defaultId', { defaultId: 1 })
      .getMany();
  }

  /**
   * Loads all raw inputs needed to build the All Locations report for a date range.
   * Dates must already be YYYY-MM-DD.
   */
  async getReportInputs(
    locations: Location[],
    startDate: string,
    endDate: string,
  ): Promise<AllLocationsReportRawInputs> {
    if (locations.length === 0) {
      return {
        locations: [],
        enrolmentsByLocationId: new Map(),
        debtByLocationId: new Map(),
        taxRateByProvinceId: new Map(),
        locationsWithLedger: new Set(),
        paymentBasedData: { categoryRows: [], amounts: [] },
        legacyPaymentsByLocationId: new Map(),
        legacyAmountsByLocationId: new Map(),
      };
    }

    const locationIds = locations.map((location) => location.id);
    const provinceIds = locations.map((location) => location.provinceId);

    const [
      activeEnrolmentsData,
      locationDebtData,
      taxCodeData,
      locationsWithLedger,
    ] = await Promise.all([
      this.getBatchActiveEnrolmentsCount(locationIds, startDate, endDate),
      this.locationDebtRepository
        .createQueryBuilder('debt')
        .where('debt.locationId IN (:...locationIds)', { locationIds })
        .getMany(),
      this.taxCodeRepository
        .createQueryBuilder('tax')
        .where('tax.provinceId IN (:...provinceIds)', { provinceIds })
        .andWhere('tax.taxTypeId = :taxTypeId', { taxTypeId: TaxCode.HST })
        .orderBy('tax.id', 'DESC')
        .getMany(),
      this.royaltyReportRepository.getLocationIdsWithLedgerActivity(
        locationIds,
        startDate,
        endDate,
      ),
    ]);

    const ledgerLocationIds = locationIds.filter((id) =>
      locationsWithLedger.has(id),
    );
    const legacyLocationIds = locationIds.filter(
      (id) => !locationsWithLedger.has(id),
    );

    const [paymentBasedData, legacyPaymentsByLocationId, legacyAmountsByLocationId] =
      await Promise.all([
        ledgerLocationIds.length > 0
          ? this.royaltyReportRepository.getPaymentBasedRoyaltyDataForLocations(
              ledgerLocationIds,
              startDate,
              endDate,
            )
          : Promise.resolve({ categoryRows: [], amounts: [] }),
        legacyLocationIds.length > 0
          ? this.royaltyReportRepository.getBatchPaymentTotals(
              legacyLocationIds,
              startDate,
              endDate,
            )
          : Promise.resolve(new Map<number, number>()),
        legacyLocationIds.length > 0
          ? this.royaltyReportRepository.getBatchLegacyAmounts(
              legacyLocationIds,
              startDate,
              endDate,
            )
          : Promise.resolve(new Map<number, LegacyRoyaltyAmounts>()),
      ]);

    const enrolmentsByLocationId = new Map(
      activeEnrolmentsData.map((item) => [item.locationId, item.count]),
    );

    const debtByLocationId = new Map<
      number,
      { royalty: number; advertisement: number }
    >();
    for (const debt of locationDebtData) {
      if (!debtByLocationId.has(debt.locationId)) {
        debtByLocationId.set(debt.locationId, {
          royalty: 5,
          advertisement: 3,
        });
      }
      if (debt.type === LocationDebt.TYPE_ROYALTY) {
        debtByLocationId.get(debt.locationId)!.royalty = Number(debt.value);
      }
      if (debt.type === LocationDebt.TYPE_ADVERTISEMENT) {
        debtByLocationId.get(debt.locationId)!.advertisement = Number(
          debt.value,
        );
      }
    }

    const taxRateByProvinceId = new Map<number, number>();
    for (const tax of taxCodeData) {
      // First row per province wins because query is ordered by id DESC.
      if (!taxRateByProvinceId.has(tax.provinceId)) {
        taxRateByProvinceId.set(tax.provinceId, Number(tax.rate));
      }
    }

    return {
      locations,
      enrolmentsByLocationId,
      debtByLocationId,
      taxRateByProvinceId,
      locationsWithLedger,
      paymentBasedData,
      legacyPaymentsByLocationId,
      legacyAmountsByLocationId,
    };
  }

  /**
   * Counts unique active regular courses with confirmed enrolments/lessons
   * overlapping the date range, grouped by location.
   */
  private async getBatchActiveEnrolmentsCount(
    locationIds: number[],
    fromDate: string,
    toDate: string,
  ): Promise<Array<{ locationId: number; count: number }>> {
    const result = await this.dataSource
      .createQueryBuilder()
      .select('c.locationId', 'locationId')
      .addSelect('c.id', 'courseId')
      .from('enrolment', 'e')
      .innerJoin('course', 'c', 'c.id = e.courseId')
      .innerJoin('lesson', 'l', 'l.courseId = c.id AND l.id IS NOT NULL')
      .where('c.locationId IN (:...locationIds)', { locationIds })
      .andWhere('c.isDeleted = false')
      .andWhere('e.isDeleted = false')
      .andWhere('e.isConfirmed = true')
      .andWhere('c.type = :regularType', { regularType: Course.TYPE_REGULAR })
      .andWhere('l.isDeleted = false')
      .andWhere('l.isConfirmed = true')
      .andWhere('l.status IN (:statuses)', {
        statuses: [1, 2, 5],
      })
      .andWhere(
        `(
        (DATE(c.startDate) BETWEEN :fromDate AND :toDate) OR
        (DATE(c.endDate) BETWEEN :fromDate AND :toDate) OR
        (DATE(c.startDate) < :fromDate AND DATE(c.endDate) > :toDate)
      )`,
        { fromDate, toDate },
      )
      .groupBy('c.locationId, c.id')
      .getRawMany();

    const locationCounts = new Map<number, number>();
    result.forEach((item) => {
      const locationId = Number(item.locationId);
      locationCounts.set(locationId, (locationCounts.get(locationId) || 0) + 1);
    });

    return Array.from(locationCounts.entries()).map(([locationId, count]) => ({
      locationId,
      count,
    }));
  }
}
