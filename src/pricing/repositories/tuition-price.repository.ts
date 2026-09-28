import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TuitionPrice } from '../entities/tuition-price.entity';
import { TuitionPrepaidPrice } from '../entities/tuition-prepaid-price.entity';
import { PricingCategoryEnum } from '../enums/pricing-category.enum';
import { SEPTEMBER_2026_PRICE_BOOK } from '../constants/september-2026-tuition';

export interface EffectivePriceQuery {
  /** Which sheet to read. Defaults to the September 2026 structure. */
  priceBook?: string;
  locationId: number | null;
  pricingCategory: PricingCategoryEnum;
  pricingTier: number;
  durationMinutes: number;
  /** `YYYY-MM-DD`. */
  effectiveDate: string;
}

@Injectable()
export class TuitionPriceRepository {
  constructor(
    @InjectRepository(TuitionPrice)
    private readonly tuitionPriceRepository: Repository<TuitionPrice>,
    @InjectRepository(TuitionPrepaidPrice)
    private readonly prepaidPriceRepository: Repository<TuitionPrepaidPrice>,
  ) {}

  /**
   * Every catalogue row covering this combination on this date, at both the
   * location scope and the global scope.
   *
   * Returns candidates rather than a single row on purpose: deciding between
   * them is the resolver's job, and it must be able to tell "no match" from
   * "several matches" so it can fail closed on ambiguity instead of silently
   * taking the first.
   *
   * Dates are compared as `YYYY-MM-DD` strings against `date` columns so the
   * boundary cannot shift under a timezone conversion - this system runs
   * lessons in EST and the 1 September cutover has to land on the right side.
   */
  async findEffectiveCandidates(
    query: EffectivePriceQuery,
  ): Promise<TuitionPrice[]> {
    const builder = this.tuitionPriceRepository
      .createQueryBuilder('price')
      .where('price.isDeleted = 0')
      .andWhere('price.priceBook = :priceBook', {
        priceBook: query.priceBook ?? SEPTEMBER_2026_PRICE_BOOK,
      })
      .andWhere('price.pricingCategory = :pricingCategory', {
        pricingCategory: query.pricingCategory,
      })
      .andWhere('price.pricingTier = :pricingTier', {
        pricingTier: query.pricingTier,
      })
      .andWhere('price.durationMinutes = :durationMinutes', {
        durationMinutes: query.durationMinutes,
      })
      .andWhere('price.effectiveFrom <= :effectiveDate', {
        effectiveDate: query.effectiveDate,
      })
      .andWhere(
        '(price.effectiveTo IS NULL OR price.effectiveTo >= :effectiveDate)',
        {
          effectiveDate: query.effectiveDate,
        },
      );

    if (query.locationId === null) {
      builder.andWhere('price.locationId IS NULL');
    } else {
      builder.andWhere(
        '(price.locationId = :locationId OR price.locationId IS NULL)',
        {
          locationId: query.locationId,
        },
      );
    }

    return builder
      .orderBy('price.effectiveFrom', 'DESC')
      .addOrderBy('price.id', 'ASC')
      .getMany();
  }

  /** The exact approved total for a term, or null when none is configured. */
  async findPrepaidPrice(
    tuitionPriceId: number,
    termMonths: number,
  ): Promise<TuitionPrepaidPrice | null> {
    return this.prepaidPriceRepository.findOne({
      where: { tuitionPriceId, termMonths, isDeleted: false },
    });
  }
}
