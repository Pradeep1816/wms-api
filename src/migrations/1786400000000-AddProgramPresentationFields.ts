import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds presentation and classification fields to `program`.
 *
 * Additive only - three nullable columns, no existing column changed and no
 * data rewritten destructively.
 *
 *  - `publicName`      the name safe to show a customer or an instructor
 *  - `pricingCategory` `standard` or `vocal`, driving which half of the
 *                      September 2026 matrix applies
 *  - `canonicalProgramId` where a retired `x` program or an interim prefixed
 *                      program points once it is merged away
 *
 * On `pricingCategory`: it is seeded from the program **name**, not from the
 * rate. Rate looks like a tempting signal because vocal programs sit at
 * $72.50/hr against $65.00 for standard - but `Harmonium` is also $72.50 and is
 * plainly an instrument. Seeding by rate would classify it as vocal and move
 * those students onto Vocal Tier 1 at $160 instead of Standard Tier 1 at $145,
 * an over-charge that lands on a parent's invoice.
 *
 * Programs that do not classify cleanly are left NULL on purpose, so they
 * surface for review rather than defaulting into a price.
 */
export class AddProgramPresentationFields1786400000000 implements MigrationInterface {
  name = 'AddProgramPresentationFields1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE program
        ADD COLUMN publicName varchar(100) NULL AFTER name,
        ADD COLUMN pricingCategory varchar(20) NULL AFTER publicName,
        ADD COLUMN canonicalProgramId int unsigned NULL AFTER pricingCategory
    `);

    await queryRunner.query(`
      CREATE INDEX IDX_program_canonical ON program (canonicalProgramId)
    `);

    // Public name defaults to the internal name, with a leading marker removed.
    // The `x` prefix marks the previous pricing structure and the underscore or
    // slash marks an interim September program; neither should ever appear on a
    // customer's invoice or an instructor's voucher.
    await queryRunner.query(`
      UPDATE program
         SET publicName = TRIM(
               CASE
                 WHEN name LIKE 'x%' AND name NOT LIKE 'x %' THEN SUBSTRING(name, 2)
                 WHEN name LIKE '\\_%' THEN SUBSTRING(name, 2)
                 WHEN name LIKE '/%' THEN SUBSTRING(name, 2)
                 ELSE name
               END
             )
       WHERE publicName IS NULL
    `);

    // Vocal programs are identified by name. Anything else that is a private
    // program and priced in the ordinary bands is standard. Outliers stay NULL
    // so migration review has to look at them.
    await queryRunner.query(`
      UPDATE program
         SET pricingCategory = 'vocal'
       WHERE isDeleted = 0
         AND type = 1
         AND LOWER(name) LIKE '%vocal%'
         AND pricingCategory IS NULL
    `);

    await queryRunner.query(`
      UPDATE program
         SET pricingCategory = 'standard'
       WHERE isDeleted = 0
         AND type = 1
         AND LOWER(name) NOT LIKE '%vocal%'
         AND rate IN (57.50, 65.00, 72.50)
         AND pricingCategory IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IDX_program_canonical ON program');
    await queryRunner.query(`
      ALTER TABLE program
        DROP COLUMN canonicalProgramId,
        DROP COLUMN pricingCategory,
        DROP COLUMN publicName
    `);
  }
}
