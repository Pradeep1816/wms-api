import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Puts the pricing tier on the enrolment, and records every change to it.
 *
 * Additive: two nullable columns on `enrolment` plus one new table. Nothing
 * existing is altered or rewritten.
 *
 * The tier is anchored here rather than on the program because that is the
 * superset of the three options the client might confirm - a teacher-anchored
 * or program-anchored rule can still populate this column, whereas putting the
 * tier on the program would need three program rows per instrument and would
 * recreate the duplicate-program family Arcadia asked us to remove.
 *
 * `pricingTierIsDefaulted` exists so a tier that nobody actually chose is
 * distinguishable from one a location set deliberately. Tier 1 is the cheapest
 * price in each category, so an unreviewed default under-charges quietly; the
 * flag is what makes those enrolments findable and reportable instead.
 *
 * Deliberately NOT backfilled. Assigning tiers to existing enrolments is the
 * migration's job, where each assignment is recorded and appears on a location
 * review report - not a silent UPDATE buried in a schema change.
 */
export class AddEnrolmentPricingTier1786500000000 implements MigrationInterface {
  name = 'AddEnrolmentPricingTier1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE enrolment
        ADD COLUMN pricingTier tinyint unsigned NULL,
        ADD COLUMN pricingTierIsDefaulted tinyint(1) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      CREATE INDEX IDX_enrolment_pricing_tier ON enrolment (pricingTier, pricingTierIsDefaulted)
    `);

    await queryRunner.query(`
      CREATE TABLE enrolment_tier_change (
        id int unsigned NOT NULL AUTO_INCREMENT,
        enrolmentId int unsigned NOT NULL,
        previousTier tinyint unsigned NULL,
        newTier tinyint unsigned NOT NULL,
        wasDefaulted tinyint(1) NOT NULL DEFAULT 0,
        effectiveFrom date NOT NULL,
        reason varchar(500) NULL,
        changedByUserId int unsigned NOT NULL,
        changedOn timestamp NOT NULL,
        createdOn timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY IDX_enrolment_tier_change_enrolment (enrolmentId),
        KEY IDX_enrolment_tier_change_changed_on (changedOn)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS enrolment_tier_change');
    await queryRunner.query(
      'DROP INDEX IDX_enrolment_pricing_tier ON enrolment',
    );
    await queryRunner.query(`
      ALTER TABLE enrolment
        DROP COLUMN pricingTierIsDefaulted,
        DROP COLUMN pricingTier
    `);
  }
}
