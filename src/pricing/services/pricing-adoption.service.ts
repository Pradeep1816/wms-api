import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import {
  hasInternalNameMarker,
  publicProgramName,
} from '../utils/program-public-name';
import { PricingRolloutService } from './pricing-rollout.service';
import { SELECTABLE_TIERS } from './tier-pricing-options.service';

export interface PricingAdoptionSummary {
  /** Whether staff at this location can put an enrolment on the new pricing. */
  isRolloutEnabled: boolean;
  /** Active enrolments at this location, whatever their pricing. */
  activeEnrolments: number;
  /** On the September structure - a tier is set. */
  onNewPricing: number;
  /** Not on it, which is every enrolment that predates the rollout. */
  onOldPricing: number;
  /**
   * Deliberately held on the pre-September rate, with a reason and an
   * approver. Arcadia approved grandfathering on 2026-08-18 for students who
   * commit before September.
   *
   * A subset of `onOldPricing`, and the distinction is the point: these are a
   * decision somebody made, not accounts waiting to be converted. Counting
   * them as outstanding would make the backlog permanently unfinishable and
   * would invite a location to "fix" a rate a customer was promised.
   */
  onPreviousRateByAgreement: number;
  /**
   * On the new pricing with a tier nobody chose. These need a person to look at
   * them, which is the only reason the flag exists.
   */
  defaultedTier: number;
  /** How the tiered ones are spread, so a location can sanity-check itself. */
  byTier: Record<number, number>;
  /**
   * Active enrolments whose program the client never classified. They can never
   * be tiered, so they are the floor under `onOldPricing` rather than work
   * outstanding.
   */
  onUnclassifiedPrograms: number;
  /**
   * On a marker-prefixed program - `xPiano Core` and the rest - which holds a
   * frozen older price sheet and is deliberately never offered a tier.
   *
   * Also part of the floor, and at Training it is most of it: 351 of 546
   * active enrolments sit on these. Separated from the unclassified count
   * because the two need opposite responses - an unclassified program is
   * missing a decision, a marker program has already had one.
   */
  onLegacyPrograms: number;
}

export interface PricingAdoptionRow {
  enrolmentId: number;
  studentId: number;
  studentName: string;
  /** Never `program.name` - this is read by staff and quoted to customers. */
  programName: string;
  pricingCategory: string | null;
  pricingTier: number | null;
  pricingTierIsDefaulted: boolean;
  /** Deliberately held on the pre-September rate. */
  keepsPreviousRate: boolean;
  /** Why, in the words of whoever agreed it. Null unless the flag is set. */
  previousRateReason: string | null;
  startDate: string | null;
  endDate: string | null;
}

interface RawAdoptionRow {
  enrolmentId: number;
  studentId: number;
  firstName: string | null;
  lastName: string | null;
  programName: string | null;
  programPublicName: string | null;
  pricingCategory: string | null;
  pricingTier: number | null;
  pricingTierIsDefaulted: number | string;
  keepsPreviousRate: number | string;
  previousRateReason: string | null;
  /** Selected so the name gate can be applied by the same rule as everywhere else. */
  locationId: number;
  startDate: string | Date | null;
  endDate: string | Date | null;
}

/**
 * Who is on the new pricing and who is not, per location.
 *
 * Arcadia paused the automated conversion of existing enrolments on 2026-08-14
 * and will work through the schools by hand later. This is the report that makes
 * that possible - and in the meantime it is the only way to tell whether the
 * rollout is being used, as opposed to staff quietly typing the old rate into a
 * screen that offered them a tier.
 *
 * Two figures deserve attention rather than a glance:
 *
 *  - **defaultedTier** is a queue. A defaulted tier is tier 1, the cheapest
 *    price in each category, so every day one sits unreviewed is a day of
 *    under-charging that nothing else surfaces.
 *  - **onUnclassifiedPrograms** is not a backlog. Those enrolments cannot be
 *    tiered at all, so subtracting them is what makes `onOldPricing` mean
 *    "could be converted" rather than "has not been".
 */
@Injectable()
export class PricingAdoptionService {
  constructor(
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    private readonly rollout: PricingRolloutService,
  ) {}

  async summaryForLocation(
    locationId: number,
    asOf: string,
  ): Promise<PricingAdoptionSummary> {
    // Grouped by program *name* as well, so the marker rule can be applied in
    // TypeScript by the same function the rest of the system uses. The
    // alternative - a REGEXP in the SQL - would be a second copy of the rule,
    // and MySQL's default collation is case-insensitive, so `^x` there would
    // match a genuine `Xylophone` that the TypeScript rule spares. One rule,
    // one place, at the cost of a few dozen extra grouped rows.
    const rows = await this.baseQuery(locationId, asOf)
      .select('enrolment.pricingTier', 'pricingTier')
      .addSelect('enrolment.pricingTierIsDefaulted', 'isDefaulted')
      .addSelect('enrolment.keepsPreviousRate', 'keepsPreviousRate')
      .addSelect('program.pricingCategory', 'pricingCategory')
      .addSelect('program.name', 'programName')
      .addSelect('COUNT(*)', 'total')
      .groupBy('enrolment.pricingTier')
      .addGroupBy('enrolment.pricingTierIsDefaulted')
      .addGroupBy('enrolment.keepsPreviousRate')
      .addGroupBy('program.pricingCategory')
      .addGroupBy('program.name')
      .getRawMany<{
        pricingTier: number | null;
        isDefaulted: number | string;
        keepsPreviousRate: number | string;
        pricingCategory: string | null;
        programName: string | null;
        total: number | string;
      }>();

    const byTier: Record<number, number> = {};
    for (const tier of SELECTABLE_TIERS) {
      byTier[tier] = 0;
    }

    let activeEnrolments = 0;
    let onNewPricing = 0;
    let defaultedTier = 0;
    let onUnclassifiedPrograms = 0;
    let onLegacyPrograms = 0;
    let onPreviousRateByAgreement = 0;

    for (const row of rows) {
      // COUNT(*) arrives as a string from the driver. Adding it would
      // concatenate, which reads as a plausible number and is not one.
      const total = Number(row.total);
      activeEnrolments += total;

      if (row.pricingCategory === null) {
        onUnclassifiedPrograms += total;
      } else if (hasInternalNameMarker(row.programName)) {
        // Classified, but holding a frozen older sheet. Only counted here when
        // it is classified, so the two buckets never double-count one row.
        onLegacyPrograms += total;
      }

      // tinyint(1) again, so compared numerically - the string "0" is truthy
      // and would report every enrolment as grandfathered.
      if (Number(row.keepsPreviousRate) === 1) {
        onPreviousRateByAgreement += total;
      }

      // Compared against null rather than tested for truthiness, because this
      // codebase has a real enrolment with id 0 and the same habit of treating
      // 0 as absent is what hid it.
      if (row.pricingTier === null) {
        continue;
      }

      onNewPricing += total;
      byTier[row.pricingTier] = (byTier[row.pricingTier] ?? 0) + total;

      // tinyint(1) comes back as 1/0, but a string "0" is truthy - the trap
      // that has bitten this codebase before. Compare numerically.
      if (Number(row.isDefaulted) === 1) {
        defaultedTier += total;
      }
    }

    return {
      isRolloutEnabled: await this.rollout.isEnabledForLocation(locationId),
      activeEnrolments,
      onNewPricing,
      onOldPricing: activeEnrolments - onNewPricing,
      onPreviousRateByAgreement,
      defaultedTier,
      byTier,
      onUnclassifiedPrograms,
      onLegacyPrograms,
    };
  }

  /**
   * The enrolments behind the summary.
   *
   * `onNewPricing` filters to one side or the other; omitting it returns both,
   * which is what a location wants when working through one teacher's students.
   */
  async listForLocation(input: {
    locationId: number;
    asOf: string;
    onNewPricing?: boolean;
    defaultedOnly?: boolean;
    /** Only enrolments deliberately held on the pre-September rate. */
    previousRateOnly?: boolean;
    page: number;
    limit: number;
  }): Promise<{ rows: PricingAdoptionRow[]; total: number }> {
    const query = this.baseQuery(input.locationId, input.asOf)
      .leftJoin('student', 'student', 'student.id = enrolment.studentId')
      .select('enrolment.id', 'enrolmentId')
      .addSelect('enrolment.studentId', 'studentId')
      .addSelect('student.firstName', 'firstName')
      .addSelect('student.lastName', 'lastName')
      .addSelect('program.name', 'programName')
      .addSelect('program.publicName', 'programPublicName')
      .addSelect('program.pricingCategory', 'pricingCategory')
      .addSelect('enrolment.pricingTier', 'pricingTier')
      .addSelect('enrolment.pricingTierIsDefaulted', 'pricingTierIsDefaulted')
      .addSelect('enrolment.keepsPreviousRate', 'keepsPreviousRate')
      .addSelect('enrolment.previousRateReason', 'previousRateReason')
      .addSelect('course.locationId', 'locationId')
      .addSelect('course.startDate', 'startDate')
      .addSelect('enrolment.endDateTime', 'endDate');

    if (input.onNewPricing === true) {
      query.andWhere('enrolment.pricingTier IS NOT NULL');
    } else if (input.onNewPricing === false) {
      query.andWhere('enrolment.pricingTier IS NULL');
    }

    if (input.defaultedOnly) {
      query.andWhere('enrolment.pricingTierIsDefaulted = 1');
    }

    if (input.previousRateOnly) {
      query.andWhere('enrolment.keepsPreviousRate = 1');
    }

    // Counted off the same builder, before paging, so the total can never
    // describe a different set of filters from the rows beside it.
    const total = await query.getCount();

    const raw = await query
      .orderBy('enrolment.id', 'ASC')
      .offset((input.page - 1) * input.limit)
      .limit(input.limit)
      .getRawMany<RawAdoptionRow>();

    return { rows: raw.map((row) => this.toRow(row)), total };
  }

  private toRow(row: RawAdoptionRow): PricingAdoptionRow {
    return {
      enrolmentId: Number(row.enrolmentId),
      studentId: Number(row.studentId),
      studentName:
        `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || 'Unknown',
      // Through the helper, so an internal marker such as the `x` prefix never
      // reaches a screen a member of staff reads a price off.
      programName:
        publicProgramName(
          { name: row.programName ?? '', publicName: row.programPublicName },
          row.locationId,
        ) || 'Unknown',
      pricingCategory: row.pricingCategory,
      pricingTier: row.pricingTier === null ? null : Number(row.pricingTier),
      pricingTierIsDefaulted: Number(row.pricingTierIsDefaulted) === 1,
      keepsPreviousRate: Number(row.keepsPreviousRate) === 1,
      previousRateReason: row.previousRateReason,
      startDate: this.dayOnly(row.startDate),
      endDate: this.dayOnly(row.endDate),
    };
  }

  /**
   * A calendar day, taken without going through a UTC conversion.
   *
   * `new Date(dateColumn).toISOString()` shifts the day either side of UTC - it
   * read 2026-09-01 back as 2026-08-31 while this was being built, on a machine
   * five and a half hours ahead.
   */
  private dayOnly(value: string | Date | null): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    return String(value).slice(0, 10);
  }

  /** Active enrolments at a location, as every other report defines them. */
  private baseQuery(locationId: number, asOf: string) {
    return this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoin('course', 'course', 'course.id = enrolment.courseId')
      .leftJoin('program', 'program', 'program.id = course.programId')
      .where('enrolment.isDeleted = 0')
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('DATE(enrolment.endDateTime) >= :asOf', { asOf });
  }
}
