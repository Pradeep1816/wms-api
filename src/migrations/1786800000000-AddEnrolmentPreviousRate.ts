import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Records an enrolment that was deliberately left on the pre-September rate.
 *
 * Arcadia approved grandfathering on 2026-08-18 for students who commit before
 * September. Four additive columns on `enrolment`; nothing existing is altered
 * or rewritten, and the default of 0 means every existing row keeps its current
 * meaning without a backfill.
 *
 * ## Why this is not a discount
 *
 * The client proposed entering the enrolment at the new rate and discounting it
 * back down. That model was built and abandoned on 2026-08-11 (`0c48e173`): the
 * published previous prepaid totals are not derivable from any percentage
 * - vocal 45-minute over three months is a printed $633.00 against a computed
 * $632.93 - so no monthly discount can reproduce them. Separately,
 * `enrolment_discount` holds one row per type per enrolment, and 191 active
 * enrolments at the two pilot locations already carry a sibling discount they
 * would have had to give up.
 *
 * A flag has neither problem, because it does not adjust a price. It declines
 * to apply the new one, and the enrolment keeps `program.rate` exactly as it
 * would have before tiering existed - so monthly, prepaid and sibling discounts
 * all behave as they do today, with no new arithmetic to be wrong about.
 *
 * The three audit columns exist because a rate concession outlives the person
 * who granted it. "The school says they were promised the old price" has to be
 * answerable in a year.
 *
 * Indexed with `pricingTier` because the adoption report's one expensive
 * question is "who at this location is on which pricing", and this column is
 * the third state in that answer.
 */
export class AddEnrolmentPreviousRate1786800000000 implements MigrationInterface {
  name = 'AddEnrolmentPreviousRate1786800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE enrolment
        ADD COLUMN keepsPreviousRate tinyint(1) NOT NULL DEFAULT 0,
        ADD COLUMN previousRateReason varchar(500) NULL,
        ADD COLUMN previousRateApprovedByUserId int unsigned NULL,
        ADD COLUMN previousRateApprovedOn datetime NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IDX_enrolment_keeps_previous_rate
        ON enrolment (keepsPreviousRate, pricingTier)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IDX_enrolment_keeps_previous_rate ON enrolment',
    );
    await queryRunner.query(`
      ALTER TABLE enrolment
        DROP COLUMN previousRateApprovedOn,
        DROP COLUMN previousRateApprovedByUserId,
        DROP COLUMN previousRateReason,
        DROP COLUMN keepsPreviousRate
    `);
  }
}
