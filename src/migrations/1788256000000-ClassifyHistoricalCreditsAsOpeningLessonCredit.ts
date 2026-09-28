import { MigrationInterface, QueryRunner } from 'typeorm';

const MIGRATION_KEY_PREFIX = 'royalty:migration:opening-lesson-credit:';

/**
 * Classifies pre-ledger customer credit as Lesson credit without changing the
 * payment or customer balance.
 *
 * The opening entry is dated to the original payment so mixed historical and
 * Phase 1 report periods include the previously recognized Lesson revenue in
 * the correct period. The first Phase 1 ledger entry is the rollout boundary,
 * preventing later recognition defects from being silently treated as
 * historical data.
 */
export class ClassifyHistoricalCreditsAsOpeningLessonCredit1788256000000 implements MigrationInterface {
  name = 'ClassifyHistoricalCreditsAsOpeningLessonCredit1788256000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const lessonCategory = (await queryRunner.query(`
      SELECT id
      FROM item_category
      WHERE id = 1 AND isDeleted = 0
      LIMIT 1
    `)) as Array<{ id: number | string }>;
    if (lessonCategory.length === 0) {
      throw new Error(
        'Cannot classify historical credits because the Lesson category is unavailable',
      );
    }

    const ambiguousCustomerLocations = (await queryRunner.query(`
      SELECT payment.id AS paymentId
      FROM payment
      LEFT JOIN user_location userLocation
        ON userLocation.user_id = payment.user_id
      WHERE COALESCE(payment.isDeleted, 0) = 0
        AND payment.amount > 0
        AND payment.balance >= 0.005
        AND payment.payment_method_id NOT IN (1, 2, 3, 12)
        AND COALESCE(payment.createdOn, payment.date) < COALESCE(
          (
            SELECT MIN(firstRecognition.createdOn)
            FROM royalty_transaction firstRecognition
            WHERE firstRecognition.eventType = 'PAYMENT_RECEIVED'
          ),
          CURRENT_TIMESTAMP
        )
        AND NOT EXISTS (
          SELECT 1
          FROM royalty_transaction existingRecognition
          WHERE existingRecognition.originalPaymentId = payment.id
            AND existingRecognition.eventType IN ('PAYMENT_RECEIVED', 'OPENING_CREDIT')
        )
      GROUP BY payment.id
      HAVING COUNT(DISTINCT userLocation.location_id) <> 1
      LIMIT 10
    `)) as Array<{ paymentId: number | string }>;
    if (ambiguousCustomerLocations.length > 0) {
      const paymentIds = ambiguousCustomerLocations
        .map((row) => row.paymentId)
        .join(', ');
      throw new Error(
        `Cannot classify historical credits with missing or ambiguous customer locations. Payment IDs: ${paymentIds}`,
      );
    }

    await queryRunner.query(`
      INSERT INTO royalty_transaction (
        paymentId,
        originalPaymentId,
        locationId,
        customerId,
        itemCategoryId,
        categoryName,
        rateApplied,
        paymentAmount,
        revenueAmount,
        taxAmount,
        royaltyAmount,
        royaltyFree,
        eventType,
        effectiveDate,
        sourceType,
        sourceId,
        relatedRoyaltyTransactionId,
        eventGroupId,
        idempotencyKey,
        reason,
        schemaVersion,
        createdOn,
        createdByUserId
      )
      SELECT
        payment.id,
        payment.id,
        userLocation.location_id,
        payment.user_id,
        lessonCategory.id,
        lessonCategory.name,
        COALESCE(lessonRoyalty.value, 0),
        payment.balance,
        payment.balance,
        0,
        ROUND(
          payment.balance * COALESCE(lessonRoyalty.value, 0) / 100,
          2
        ),
        0,
        'OPENING_CREDIT',
        payment.date,
        'MIGRATION',
        payment.id,
        NULL,
        CONCAT('migration:opening-lesson-credit:', payment.id),
        CONCAT('${MIGRATION_KEY_PREFIX}', payment.id),
        'Historical customer credit classified as opening Lesson credit',
        1,
        CURRENT_TIMESTAMP,
        NULL
      FROM payment
      INNER JOIN (
        SELECT
          customerLocation.user_id,
          MIN(customerLocation.location_id) AS location_id
        FROM user_location customerLocation
        GROUP BY customerLocation.user_id
        HAVING COUNT(DISTINCT customerLocation.location_id) = 1
      ) userLocation ON userLocation.user_id = payment.user_id
      INNER JOIN item_category lessonCategory
        ON lessonCategory.id = 1 AND lessonCategory.isDeleted = 0
      LEFT JOIN location_debt lessonRoyalty
        ON lessonRoyalty.id = (
          SELECT MAX(locationRoyalty.id)
          FROM location_debt locationRoyalty
          WHERE locationRoyalty.locationId = userLocation.location_id
            AND locationRoyalty.type = 1
        )
      WHERE COALESCE(payment.isDeleted, 0) = 0
        AND payment.amount > 0
        AND payment.balance >= 0.005
        AND payment.payment_method_id NOT IN (1, 2, 3, 12)
        AND COALESCE(payment.createdOn, payment.date) < COALESCE(
          (
            SELECT MIN(firstRecognition.createdOn)
            FROM royalty_transaction firstRecognition
            WHERE firstRecognition.eventType = 'PAYMENT_RECEIVED'
          ),
          CURRENT_TIMESTAMP
        )
        AND NOT EXISTS (
          SELECT 1
          FROM royalty_transaction existingRecognition
          WHERE existingRecognition.originalPaymentId = payment.id
            AND existingRecognition.eventType IN ('PAYMENT_RECEIVED', 'OPENING_CREDIT')
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dependentAdjustments = (await queryRunner.query(`
      SELECT adjustment.id
      FROM royalty_transaction adjustment
      INNER JOIN royalty_transaction openingCredit
        ON openingCredit.id = adjustment.relatedRoyaltyTransactionId
      WHERE openingCredit.idempotencyKey LIKE '${MIGRATION_KEY_PREFIX}%'
        AND adjustment.idempotencyKey NOT LIKE '${MIGRATION_KEY_PREFIX}%'
      LIMIT 1
    `)) as Array<{ id: number | string }>;
    if (dependentAdjustments.length > 0) {
      throw new Error(
        'Cannot revert opening Lesson credit classifications after a classified credit has been allocated, transferred, or refunded',
      );
    }

    await queryRunner.query(`
      DELETE FROM royalty_transaction
      WHERE idempotencyKey LIKE '${MIGRATION_KEY_PREFIX}%'
    `);
  }
}
