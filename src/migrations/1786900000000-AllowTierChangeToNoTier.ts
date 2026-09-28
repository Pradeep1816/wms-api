import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets `enrolment_tier_change` record a move *away* from every tier.
 *
 * `newTier` was `NOT NULL`, which was right while the only thing that could
 * happen to an enrolment was being given a tier. From 2026-08-18 staff can move
 * one to the previous rate instead, and that has to appear in the same history
 * they already read - otherwise a change shows up in one of two places
 * depending on which way it went.
 *
 * The alternative was writing `0` to mean "no tier". This codebase already has
 * a real enrolment with **id 0** and a `EXISTS()` that returns the truthy
 * string `"0"`; adding a third zero-means-absent convention to a money audit
 * table is how the next person loses an afternoon. NULL says it once.
 *
 * Widening a column only relaxes a constraint, so every existing row stays
 * valid and nothing needs rewriting.
 */
export class AllowTierChangeToNoTier1786900000000 implements MigrationInterface {
  name = 'AllowTierChangeToNoTier1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE enrolment_tier_change MODIFY newTier tinyint unsigned NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rows written for a move to the previous rate carry NULL and cannot be
    // expressed under the old constraint, so they are removed rather than
    // silently coerced to a tier nobody chose.
    await queryRunner.query(
      'DELETE FROM enrolment_tier_change WHERE newTier IS NULL',
    );
    await queryRunner.query(
      'ALTER TABLE enrolment_tier_change MODIFY newTier tinyint unsigned NOT NULL',
    );
  }
}
