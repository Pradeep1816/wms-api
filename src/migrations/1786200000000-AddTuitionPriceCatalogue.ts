import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  SEPTEMBER_2026_TUITION,
  SEPTEMBER_2026_EFFECTIVE_FROM,
  SEPTEMBER_2026_PRICE_BOOK,
} from '../pricing/constants/september-2026-tuition';

/**
 * Creates the effective-dated tuition catalogue and seeds the approved
 * September 2026 matrix: 18 monthly amounts and 54 prepaid amounts.
 *
 * The seed reads `SEPTEMBER_2026_TUITION`, which is the single authoritative
 * record of the client's approved figures. That constant is frozen - a future
 * price change is a NEW catalogue row with a later `effectiveFrom`, or an edit
 * through the admin UI. It is never an edit to the constant or to this
 * migration, so replaying migrations always reproduces the September 2026
 * catalogue exactly.
 *
 * The seed is idempotent: re-running it inserts nothing if the September 2026
 * rows are already present.
 *
 * Note on the unique key: MySQL treats NULLs as distinct, so the key does not
 * prevent two global (NULL locationId) rows sharing a key. Single-active-match
 * and overlap rejection are enforced in the pricing resolver service.
 */
export class AddTuitionPriceCatalogue1786200000000 implements MigrationInterface {
  name = 'AddTuitionPriceCatalogue1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE tuition_price (
        id int unsigned NOT NULL AUTO_INCREMENT,
        locationId int unsigned NULL,
        priceBook varchar(40) NOT NULL DEFAULT 'september_2026',
        pricingCategory varchar(20) NOT NULL,
        pricingTier tinyint unsigned NOT NULL,
        durationMinutes smallint unsigned NOT NULL,
        effectiveFrom date NOT NULL,
        effectiveTo date NULL,
        monthlyAmount decimal(10,2) NOT NULL,
        hourlyRate decimal(10,2) NOT NULL,
        isDeleted tinyint(1) NOT NULL DEFAULT 0,
        createdOn timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        updatedOn timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        createdByUserId int unsigned NULL,
        updatedByUserId int unsigned NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_tuition_price_scope (
          priceBook, locationId, pricingCategory, pricingTier, durationMinutes,
          effectiveFrom
        ),
        KEY IDX_tuition_price_lookup (
          priceBook, pricingCategory, pricingTier, durationMinutes, effectiveFrom
        ),
        KEY IDX_tuition_price_location (locationId)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE tuition_prepaid_price (
        id int unsigned NOT NULL AUTO_INCREMENT,
        tuitionPriceId int unsigned NOT NULL,
        termMonths tinyint unsigned NOT NULL,
        amount decimal(10,2) NOT NULL,
        referencePercentage decimal(5,2) NULL,
        isDeleted tinyint(1) NOT NULL DEFAULT 0,
        createdOn timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        updatedOn timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        createdByUserId int unsigned NULL,
        updatedByUserId int unsigned NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_tuition_prepaid_price_term (tuitionPriceId, termMonths),
        KEY IDX_tuition_prepaid_price_parent (tuitionPriceId),
        CONSTRAINT FK_tuition_prepaid_price_tuition_price
          FOREIGN KEY (tuitionPriceId) REFERENCES tuition_price (id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    // Internal reference only - never used to calculate a billed amount.
    const referencePercentageByTerm: Record<number, string> = {
      3: '3.00',
      6: '5.00',
      12: '8.00',
    };

    for (const price of SEPTEMBER_2026_TUITION) {
      const existing = (await queryRunner.query(
        `SELECT id FROM tuition_price
          WHERE priceBook = ?
            AND locationId IS NULL
            AND pricingCategory = ?
            AND pricingTier = ?
            AND durationMinutes = ?
            AND effectiveFrom = ?
          LIMIT 1`,
        [
          SEPTEMBER_2026_PRICE_BOOK,
          price.category,
          price.tier,
          price.durationMinutes,
          SEPTEMBER_2026_EFFECTIVE_FROM,
        ],
      )) as { id: number }[];

      let tuitionPriceId: number;

      if (existing.length > 0) {
        tuitionPriceId = existing[0].id;
      } else {
        const result = (await queryRunner.query(
          `INSERT INTO tuition_price (
             priceBook, locationId, pricingCategory, pricingTier, durationMinutes,
             effectiveFrom, effectiveTo, monthlyAmount, hourlyRate
           ) VALUES (?, NULL, ?, ?, ?, ?, NULL, ?, ?)`,
          [
            SEPTEMBER_2026_PRICE_BOOK,
            price.category,
            price.tier,
            price.durationMinutes,
            SEPTEMBER_2026_EFFECTIVE_FROM,
            price.monthlyAmount,
            price.hourlyRate,
          ],
        )) as { insertId: number };
        tuitionPriceId = result.insertId;
      }

      for (const [termMonths, amount] of Object.entries(price.prepaid)) {
        await queryRunner.query(
          `INSERT INTO tuition_prepaid_price (
             tuitionPriceId, termMonths, amount, referencePercentage
           ) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
          [
            tuitionPriceId,
            Number(termMonths),
            amount,
            referencePercentageByTerm[Number(termMonths)] ?? null,
          ],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS tuition_prepaid_price');
    await queryRunner.query('DROP TABLE IF EXISTS tuition_price');
  }
}
