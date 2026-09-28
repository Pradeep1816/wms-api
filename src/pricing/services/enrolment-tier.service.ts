import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { EnrolmentTierChange } from '../entities/enrolment-tier-change.entity';
import {
  PricingResolutionError,
  PricingResolutionErrorCode,
} from '../errors/pricing-resolution.error';
import { getCurrentESTDate } from '../../utils/date-utils';

/** The tier assigned when nobody has chosen one. */
export const DEFAULT_PRICING_TIER = 1;

const VALID_TIERS = [1, 2, 3];

export interface AssignTierInput {
  enrolmentId: number;
  tier: number;
  /** True when this is a migration default rather than a human choice. */
  isDefaulted: boolean;
  /** `YYYY-MM-DD`; normally the next cycle start, or the cutover. */
  effectiveFrom: string;
  reason?: string;
  changedByUserId: number;
}

export interface DefaultedTierRow {
  enrolmentId: number;
  courseId: number;
  studentId: number;
  pricingTier: number;
}

/**
 * One entry in an enrolment's pricing history, ready to show a person.
 *
 * `basis` and `previousBasis` are words rather than tier numbers because a
 * NULL `newTier` is not "no tier" - it means the enrolment was moved off
 * tiered pricing onto the rate it already had, which is a deliberate choice
 * staff make and needs to read as one.
 */
export interface PricingBasisHistoryEntry {
  id: number;
  previousTier: number | null;
  newTier: number | null;
  previousBasis: string;
  basis: string;
  /** True when nobody chose this - the migration defaulted it. */
  wasDefaulted: boolean;
  /** `YYYY-MM-DD`. */
  effectiveFrom: string;
  /** The "why" note. NULL only for the migration's own initial assignment. */
  reason: string | null;
  changedOn: string;
  changedByUserId: number;
  /** Staff member's name, or their username / id when no profile exists. */
  changedBy: string;
}

/**
 * Assigns and changes the pricing tier on an enrolment, with an audit trail.
 *
 * Two things this deliberately does **not** do:
 *
 *  - it does not default silently on the read path. `TierResolverService`
 *    raises `UNRESOLVED_TIER` for an enrolment with no tier, because tier 1 is
 *    the cheapest price in each category and a silent default under-charges
 *    with nothing to surface it. Defaulting happens here, explicitly, flagged,
 *    and recorded;
 *  - it does not expire or re-evaluate tiers on a schedule. A tier changes when
 *    a person changes it.
 */
@Injectable()
export class EnrolmentTierService {
  constructor(
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(EnrolmentTierChange)
    private readonly tierChangeRepository: Repository<EnrolmentTierChange>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Set an enrolment's tier and record the change.
   *
   * Used both by migration - with `isDefaulted` true - and by staff changing a
   * tier afterwards, so a single code path produces the audit history.
   */
  async assign(input: AssignTierInput): Promise<EnrolmentTierChange> {
    if (!VALID_TIERS.includes(input.tier)) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        `Pricing tier ${input.tier} is not one of 1, 2 or 3`,
        { enrolmentId: input.enrolmentId, tier: input.tier },
      );
    }

    const enrolment = await this.enrolmentRepository.findOne({
      where: { id: input.enrolmentId },
    });

    if (!enrolment) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        `Enrolment ${input.enrolmentId} was not found`,
        { enrolmentId: input.enrolmentId },
      );
    }

    const previousTier = enrolment.pricingTier ?? null;

    return this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Enrolment).update(
        { id: input.enrolmentId },
        {
          pricingTier: input.tier,
          pricingTierIsDefaulted: input.isDefaulted,
        },
      );

      return manager.getRepository(EnrolmentTierChange).save(
        manager.getRepository(EnrolmentTierChange).create({
          enrolmentId: input.enrolmentId,
          previousTier,
          newTier: input.tier,
          wasDefaulted: input.isDefaulted,
          effectiveFrom: input.effectiveFrom as unknown as Date,
          reason: input.reason ?? null,
          changedByUserId: input.changedByUserId,
          changedOn: getCurrentESTDate(),
        }),
      );
    });
  }

  /**
   * Change a tier that a person is choosing, clearing the defaulted flag.
   *
   * Refuses a no-op so the audit trail does not fill with changes that changed
   * nothing, which would make the genuine ones harder to find.
   */
  async change(
    input: Omit<AssignTierInput, 'isDefaulted'>,
  ): Promise<EnrolmentTierChange> {
    const enrolment = await this.enrolmentRepository.findOne({
      where: { id: input.enrolmentId },
    });

    if (
      enrolment &&
      enrolment.pricingTier === input.tier &&
      !enrolment.pricingTierIsDefaulted
    ) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        `Enrolment ${input.enrolmentId} is already on tier ${input.tier}`,
        { enrolmentId: input.enrolmentId, tier: input.tier },
      );
    }

    return this.assign({ ...input, isDefaulted: false });
  }

  /**
   * Enrolments still sitting on a defaulted tier, for the location review
   * report the client was promised.
   *
   * Scoped by location through the course, since that is how staff work.
   */
  async findDefaultedForLocation(
    locationId: number,
  ): Promise<DefaultedTierRow[]> {
    return this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .select('enrolment.id', 'enrolmentId')
      .addSelect('enrolment.courseId', 'courseId')
      .addSelect('enrolment.studentId', 'studentId')
      .addSelect('enrolment.pricingTier', 'pricingTier')
      .innerJoin('course', 'course', 'course.id = enrolment.courseId')
      .where('enrolment.isDeleted = 0')
      .andWhere('enrolment.pricingTierIsDefaulted = 1')
      .andWhere('course.locationId = :locationId', { locationId })
      .orderBy('enrolment.id', 'ASC')
      .getRawMany<DefaultedTierRow>();
  }

  /** Full change history for one enrolment, oldest first. */
  async findHistory(enrolmentId: number): Promise<EnrolmentTierChange[]> {
    return this.tierChangeRepository.find({
      where: { enrolmentId },
      order: { changedOn: 'ASC', id: 'ASC' },
    });
  }

  /**
   * The same history, resolved for display: who changed it, and their note.
   *
   * ## Why this is a raw query rather than `findHistory` plus a lookup
   *
   * `effectiveFrom` is a DATE. TypeORM hydrates one into a Date at LOCAL
   * midnight, and `toISOString().slice(0, 10)` on that reports the previous
   * day anywhere ahead of UTC - an effective date of 2026-09-01 reaching the
   * screen as 31 August. Formatting it in SQL removes the opportunity.
   *
   * The user joins are LEFT joins on purpose. A change made by a user whose
   * profile row has since gone should still appear, with a weaker name, rather
   * than dropping out of the history entirely.
   *
   * ## Scoped by location, and it has to be
   *
   * `enrolment_tier_change` carries no location of its own, so without the
   * inner joins below any signed-in staff member could read any enrolment's
   * pricing history by putting someone else's id in the URL - what a student
   * pays and who moved them, across schools that do not share staff. The
   * location comes off the course, which is how every other enrolment-scoped
   * query in this system establishes it.
   *
   * An enrolment at another location returns an empty history rather than an
   * error, which is the same answer as an enrolment that has never had its
   * pricing changed. That is deliberate: distinguishing them would confirm the
   * id exists.
   */
  async findHistoryForDisplay(
    enrolmentId: number,
    locationId: number,
  ): Promise<PricingBasisHistoryEntry[]> {
    const rows = await this.tierChangeRepository
      .createQueryBuilder('change')
      .select('change.id', 'id')
      .addSelect('change.previousTier', 'previousTier')
      .addSelect('change.newTier', 'newTier')
      .addSelect('change.wasDefaulted', 'wasDefaulted')
      .addSelect("DATE_FORMAT(change.effectiveFrom, '%Y-%m-%d')", 'effectiveFrom')
      .addSelect('change.reason', 'reason')
      .addSelect(
        "DATE_FORMAT(change.changedOn, '%Y-%m-%dT%H:%i:%s')",
        'changedOn',
      )
      .addSelect('change.changedByUserId', 'changedByUserId')
      .addSelect('profile.firstname', 'firstName')
      .addSelect('profile.lastname', 'lastName')
      .addSelect('changedByUser.username', 'username')
      .leftJoin('user', 'changedByUser', 'changedByUser.id = change.changedByUserId')
      .leftJoin('user_profile', 'profile', 'profile.user_id = change.changedByUserId')
      .innerJoin('enrolment', 'enrolment', 'enrolment.id = change.enrolmentId')
      .innerJoin(
        'course',
        'course',
        'course.id = enrolment.courseId AND course.locationId = :locationId',
        { locationId },
      )
      .where('change.enrolmentId = :enrolmentId', { enrolmentId })
      .orderBy('change.changedOn', 'DESC')
      .addOrderBy('change.id', 'DESC')
      .getRawMany<{
        id: number;
        previousTier: number | null;
        newTier: number | null;
        wasDefaulted: number;
        effectiveFrom: string;
        reason: string | null;
        changedOn: string;
        changedByUserId: number;
        firstName: string | null;
        lastName: string | null;
        username: string | null;
      }>();

    // Rows come back newest first, so the LAST one is the enrolment's first
    // change. That distinction decides how a NULL `previousTier` reads.
    const oldestIndex = rows.length - 1;

    return rows.map((row, index) => ({
      id: Number(row.id),
      previousTier: row.previousTier === null ? null : Number(row.previousTier),
      newTier: row.newTier === null ? null : Number(row.newTier),
      previousBasis: describeBasis(
        row.previousTier,
        index === oldestIndex ? 'Not set' : 'Previous rate',
      ),
      basis: describeBasis(row.newTier, 'Previous rate'),
      wasDefaulted: Number(row.wasDefaulted) === 1,
      effectiveFrom: row.effectiveFrom,
      reason: row.reason,
      changedOn: row.changedOn,
      changedByUserId: Number(row.changedByUserId),
      changedBy:
        [row.firstName, row.lastName].filter(Boolean).join(' ').trim() ||
        row.username ||
        `User ${row.changedByUserId}`,
    }));
  }
}

/**
 * What a tier column means in words.
 *
 * NULL is genuinely ambiguous in this table. In `newTier` it always means
 * "moved off tiered pricing onto the rate it already had". In `previousTier`
 * it means that too - except on an enrolment's FIRST entry, where it means
 * there was no tier yet. Only the caller knows which row it is holding, so it
 * passes the reading in.
 */
function describeBasis(tier: number | null, whenNull: string): string {
  return tier === null ? whenNull : `Tier ${Number(tier)}`;
}
