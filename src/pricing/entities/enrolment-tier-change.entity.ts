import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * One row per change to an enrolment's pricing tier.
 *
 * A tier change changes what a customer pays, so it needs the same treatment
 * as any other money-affecting action: who did it, when, from what to what, and
 * why. `enrolment` itself carries no audit columns, so recording it here keeps
 * that history even after the tier moves again.
 *
 * The migration's initial assignment is recorded here too, with
 * `wasDefaulted = true` where nobody chose the value. That is what makes
 * "which enrolments are still on a tier we guessed" answerable.
 */
@Entity('enrolment_tier_change')
@Index(['enrolmentId'])
export class EnrolmentTierChange {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'enrolmentId', type: 'int', unsigned: true })
  enrolmentId: number;

  /** NULL when the enrolment had no tier before - the initial assignment. */
  @Column({
    name: 'previousTier',
    type: 'tinyint',
    unsigned: true,
    nullable: true,
  })
  previousTier: number | null;

  /**
   * The tier the enrolment moved to, or NULL when it moved off tiered pricing
   * altogether - which is what "keep the previous rate" means. Nullable since
   * 2026-08-18; see `AllowTierChangeToNoTier1786900000000` for why this is not
   * a `0`.
   */
  @Column({ name: 'newTier', type: 'tinyint', unsigned: true, nullable: true })
  newTier: number | null;

  /** True when this value was defaulted rather than chosen by a person. */
  @Column({ name: 'wasDefaulted', type: 'tinyint', width: 1, default: 0 })
  wasDefaulted: boolean;

  /**
   * When the new tier starts applying.
   *
   * A tier change takes effect from the next billing cycle, matching the rule
   * used for the September cutover: an already-invoiced or in-progress cycle is
   * never re-priced underneath a customer.
   */
  @Column({ name: 'effectiveFrom', type: 'date' })
  effectiveFrom: Date;

  @Column({ name: 'reason', type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @Column({ name: 'changedByUserId', type: 'int', unsigned: true })
  changedByUserId: number;

  @Column({ name: 'changedOn', type: 'timestamp' })
  changedOn: Date;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;
}
