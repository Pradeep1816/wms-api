import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { CustomerBalanceCalculationRepository } from '../customer/repositories/customer-balance-calculation.repository';

export class FixNonInvoicedPrivateLessonRoundingTotals1780986217001
  implements MigrationInterface
{
  name = 'FixNonInvoicedPrivateLessonRoundingTotals1780986217001';

  private readonly migrationName =
    'FixNonInvoicedPrivateLessonRoundingTotals1780986217001';
  private readonly backupTable = 'migration_rounding_noninv_pl_backup';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createBackupTable(queryRunner);
    await this.createCandidateTable(queryRunner);
    await this.backupCandidates(queryRunner);
    await this.updatePrivateLessons(queryRunner);
    await this.refreshAffectedCustomerBalances(queryRunner);
    await this.dropCandidateTable(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE private_lesson pl
      INNER JOIN \`${this.backupTable}\` b
        ON b.privateLessonId = pl.id
       AND b.migrationName = ?
      SET
        pl.total = b.oldTotal,
        pl.balance = b.oldBalance
      `,
      [this.migrationName],
    );

    await this.refreshAffectedCustomerBalances(queryRunner);

    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }

  private async createBackupTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`privateLessonId\` int unsigned NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`locationId\` int unsigned NOT NULL,
        \`customerId\` int unsigned NOT NULL,
        \`studentId\` int unsigned NOT NULL,
        \`enrolmentId\` int unsigned NOT NULL,
        \`oldTotal\` decimal(10,4) NOT NULL,
        \`oldBalance\` decimal(10,4) NOT NULL,
        \`oldPaidAmount\` decimal(10,4) NOT NULL,
        \`newTotal\` decimal(10,4) NOT NULL,
        \`newBalance\` decimal(10,4) NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`privateLessonId\`),
        KEY \`idx_rnd_noninv_lesson\` (\`lessonId\`),
        KEY \`idx_rnd_noninv_loc\` (\`locationId\`),
        KEY \`idx_rnd_noninv_customer\` (\`customerId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);
  }

  private async createCandidateTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TEMPORARY TABLE IF EXISTS tmp_rounding_noninv_pl_fix');

    await queryRunner.query(`
      CREATE TEMPORARY TABLE tmp_rounding_noninv_pl_fix AS
      SELECT
        final.privateLessonId,
        final.lessonId,
        final.locationId,
        final.customerId,
        final.studentId,
        final.enrolmentId,
        final.oldTotal,
        final.oldBalance,
        final.oldPaidAmount,
        CAST(ROUND(final.correctedTotal, 4) AS DECIMAL(10,4)) AS newTotal,
        CAST(
          CASE
            WHEN ROUND(final.correctedTotal - final.oldPaidAmount, 2) BETWEEN -0.09 AND 0.09
              THEN 0
            ELSE ROUND(final.correctedTotal - final.oldPaidAmount, 4)
          END AS DECIMAL(10,4)
        ) AS newBalance
      FROM (
        SELECT
          calc.privateLessonId,
          calc.lessonId,
          calc.locationId,
          calc.customerId,
          calc.studentId,
          calc.enrolmentId,
          calc.oldTotal,
          calc.oldBalance,
          calc.oldPaidAmount,
          ROUND(calc.finalNet + calc.lessonTax, 2) AS correctedTotal,
          ROUND(calc.oldInvoiceNet + calc.lessonTax, 2) AS oldFaultyTotal
        FROM (
          SELECT
            pf_calc.*,
            ROUND(pf_calc.grossPrice - pf_calc.correctedTotalDiscountFinal, 2) AS finalNet,
            ROUND(pf_calc.grossPrice - ROUND(pf_calc.oldTotalDiscountFinal, 2), 2) AS oldInvoiceNet
          FROM (
            SELECT
              customer_calc.*,
              customer_calc.correctedTotalDiscountAfterLine
                + customer_calc.correctedCustomerDiscount
                + customer_calc.correctedPfDiscount AS correctedTotalDiscountFinal,
              customer_calc.oldTotalDiscountAfterLine
                + customer_calc.oldCustomerDiscount
                + customer_calc.oldPfDiscount AS oldTotalDiscountFinal
            FROM (
              SELECT
                line_calc.*,
                CASE
                  WHEN line_calc.customerDiscountId IS NULL THEN 0
                  ELSE (line_calc.customerDiscountValue / 100) * line_calc.correctedPriceAfterLine
                END AS correctedCustomerDiscount,
                CASE
                  WHEN line_calc.customerDiscountId IS NULL THEN 0
                  ELSE (line_calc.customerDiscountValue / 100) * line_calc.oldPriceAfterLine
                END AS oldCustomerDiscount,
                CASE
                  WHEN line_calc.pfDiscountId IS NULL THEN 0
                  ELSE (line_calc.pfDiscountValue / 100) * (
                    line_calc.grossPrice
                    - (
                      line_calc.correctedTotalDiscountAfterLine
                      + CASE
                          WHEN line_calc.customerDiscountId IS NULL THEN 0
                          ELSE (line_calc.customerDiscountValue / 100) * line_calc.correctedPriceAfterLine
                        END
                    )
                  )
                END AS correctedPfDiscount,
                CASE
                  WHEN line_calc.pfDiscountId IS NULL THEN 0
                  ELSE (line_calc.pfDiscountValue / 100) * (
                    line_calc.grossPrice
                    - ROUND(
                      line_calc.oldTotalDiscountAfterLine
                      + CASE
                          WHEN line_calc.customerDiscountId IS NULL THEN 0
                          ELSE (line_calc.customerDiscountValue / 100) * line_calc.oldPriceAfterLine
                        END,
                      2
                    )
                  )
                END AS oldPfDiscount
              FROM (
                SELECT
                  multi_calc.*,
                  CASE
                    WHEN multi_calc.lineDiscountId IS NULL THEN 0
                    WHEN multi_calc.lineDiscountValueType = 1 THEN
                      (multi_calc.lineDiscountValue / 100) * multi_calc.correctedPriceAfterMulti
                    ELSE
                      CASE
                        WHEN multi_calc.correctedPriceAfterMulti < 0 THEN -multi_calc.lineDiscountValue
                        ELSE multi_calc.lineDiscountValue
                      END
                  END AS correctedLineDiscount,
                  CASE
                    WHEN multi_calc.lineDiscountId IS NULL THEN 0
                    WHEN multi_calc.lineDiscountValueType = 1 THEN
                      (multi_calc.lineDiscountValue / 100) * multi_calc.oldPriceAfterMulti
                    ELSE
                      CASE
                        WHEN multi_calc.oldPriceAfterMulti < 0 THEN -multi_calc.lineDiscountValue
                        ELSE multi_calc.lineDiscountValue
                      END
                      END AS oldLineDiscount,
                  multi_calc.correctedTotalDiscount
                    + CASE
                        WHEN multi_calc.lineDiscountId IS NULL THEN 0
                        WHEN multi_calc.lineDiscountValueType = 1 THEN
                          (multi_calc.lineDiscountValue / 100) * multi_calc.correctedPriceAfterMulti
                        ELSE
                          CASE
                            WHEN multi_calc.correctedPriceAfterMulti < 0 THEN -multi_calc.lineDiscountValue
                            ELSE multi_calc.lineDiscountValue
                          END
                      END AS correctedTotalDiscountAfterLine,
                  multi_calc.oldTotalDiscount
                    + CASE
                        WHEN multi_calc.lineDiscountId IS NULL THEN 0
                        WHEN multi_calc.lineDiscountValueType = 1 THEN
                          (multi_calc.lineDiscountValue / 100) * multi_calc.oldPriceAfterMulti
                        ELSE
                          CASE
                            WHEN multi_calc.oldPriceAfterMulti < 0 THEN -multi_calc.lineDiscountValue
                            ELSE multi_calc.lineDiscountValue
                          END
                      END AS oldTotalDiscountAfterLine,
                  multi_calc.grossPrice
                    - (
                      multi_calc.correctedTotalDiscount
                      + CASE
                          WHEN multi_calc.lineDiscountId IS NULL THEN 0
                          WHEN multi_calc.lineDiscountValueType = 1 THEN
                            (multi_calc.lineDiscountValue / 100) * multi_calc.correctedPriceAfterMulti
                          ELSE
                            CASE
                              WHEN multi_calc.correctedPriceAfterMulti < 0 THEN -multi_calc.lineDiscountValue
                              ELSE multi_calc.lineDiscountValue
                            END
                        END
                    ) AS correctedPriceAfterLine,
                  multi_calc.grossPrice
                    - ROUND(
                      multi_calc.oldTotalDiscount
                      + CASE
                          WHEN multi_calc.lineDiscountId IS NULL THEN 0
                          WHEN multi_calc.lineDiscountValueType = 1 THEN
                            (multi_calc.lineDiscountValue / 100) * multi_calc.oldPriceAfterMulti
                          ELSE
                            CASE
                              WHEN multi_calc.oldPriceAfterMulti < 0 THEN -multi_calc.lineDiscountValue
                              ELSE multi_calc.lineDiscountValue
                            END
                        END,
                      2
                    ) AS oldPriceAfterLine
                FROM (
                  SELECT
                    base.*,
                    CASE
                      WHEN base.multiDiscountId IS NULL THEN 0
                      WHEN base.grossPrice < 0 THEN -base.multiDiscountValue
                      ELSE base.multiDiscountValue
                    END AS correctedMultiDiscount,
                    CASE
                      WHEN base.multiDiscountId IS NULL THEN 0
                      WHEN base.grossPrice < 0 THEN -base.multiDiscountValue
                      ELSE base.multiDiscountValue
                    END AS oldMultiDiscount,
                    CASE
                      WHEN base.multiDiscountId IS NULL THEN 0
                      WHEN base.grossPrice < 0 THEN -base.multiDiscountValue
                      ELSE base.multiDiscountValue
                    END AS correctedTotalDiscount,
                    CASE
                      WHEN base.multiDiscountId IS NULL THEN 0
                      WHEN base.grossPrice < 0 THEN -base.multiDiscountValue
                      ELSE base.multiDiscountValue
                    END AS oldTotalDiscount,
                    base.grossPrice
                      - CASE
                          WHEN base.multiDiscountId IS NULL THEN 0
                          WHEN base.grossPrice < 0 THEN -base.multiDiscountValue
                          ELSE base.multiDiscountValue
                        END AS correctedPriceAfterMulti,
                    base.grossPrice
                      - ROUND(
                        CASE
                          WHEN base.multiDiscountId IS NULL THEN 0
                          WHEN base.grossPrice < 0 THEN -base.multiDiscountValue
                          ELSE base.multiDiscountValue
                        END,
                        2
                      ) AS oldPriceAfterMulti
                  FROM (
                    SELECT
                      pl.id AS privateLessonId,
                      l.id AS lessonId,
                      c.locationId AS locationId,
                      s.customer_id AS customerId,
                      s.id AS studentId,
                      e.id AS enrolmentId,
                      CAST(ROUND(pl.total, 4) AS DECIMAL(10,4)) AS oldTotal,
                      CAST(ROUND(pl.balance, 4) AS DECIMAL(10,4)) AS oldBalance,
                      CAST(ROUND(COALESCE(paid.totalPaid, 0), 4) AS DECIMAL(10,4)) AS oldPaidAmount,
                      ROUND(l.programRate * (TIME_TO_SEC(l.duration) / 3600), 2) AS grossPrice,
                      COALESCE(l.tax, 0) AS lessonTax,
                      ld_multi.id AS multiDiscountId,
                      COALESCE(ld_multi.value, 0) AS multiDiscountValue,
                      COALESCE(ld_multi.valueType, 0) AS multiDiscountValueType,
                      ld_line.id AS lineDiscountId,
                      COALESCE(ld_line.value, 0) AS lineDiscountValue,
                      COALESCE(ld_line.valueType, 0) AS lineDiscountValueType,
                      ld_customer.id AS customerDiscountId,
                      COALESCE(ld_customer.value, 0) AS customerDiscountValue,
                      COALESCE(ld_customer.valueType, 1) AS customerDiscountValueType,
                      ld_pf.id AS pfDiscountId,
                      COALESCE(ld_pf.value, 0) AS pfDiscountValue,
                      COALESCE(ld_pf.valueType, 1) AS pfDiscountValueType
                    FROM private_lesson pl
                    INNER JOIN lesson l
                      ON l.id = pl.lessonId
                     AND l.isDeleted = 0
                     AND l.isConfirmed = 1
                     AND l.status <> 4
                    INNER JOIN course c
                      ON c.id = l.courseId
                     AND c.isDeleted = 0
                    INNER JOIN program prog
                      ON prog.id = c.programId
                     AND prog.type = 1
                    INNER JOIN enrolment e
                      ON e.courseId = c.id
                     AND e.isDeleted = 0
                     AND e.isConfirmed = 1
                    INNER JOIN student s
                      ON s.id = e.studentId
                     AND s.isDeleted = 0
                    LEFT JOIN (
                      SELECT
                        lp.lessonId,
                        ROUND(SUM(lp.amount), 4) AS totalPaid
                      FROM lesson_payment lp
                      INNER JOIN payment pay
                        ON pay.id = lp.paymentId
                       AND pay.isDeleted = 0
                       AND pay.payment_method_id <> 2
                      WHERE lp.isDeleted = 0
                      GROUP BY lp.lessonId
                    ) paid
                      ON paid.lessonId = l.id
                    LEFT JOIN lesson_discount ld_multi
                      ON ld_multi.id = (
                        SELECT MIN(ld.id)
                        FROM lesson_discount ld
                        WHERE ld.lessonId = l.id
                          AND ld.type = 3
                      )
                    LEFT JOIN lesson_discount ld_line
                      ON ld_line.id = (
                        SELECT MIN(ld.id)
                        FROM lesson_discount ld
                        WHERE ld.lessonId = l.id
                          AND ld.type = 4
                      )
                    LEFT JOIN lesson_discount ld_customer
                      ON ld_customer.id = (
                        SELECT MIN(ld.id)
                        FROM lesson_discount ld
                        WHERE ld.lessonId = l.id
                          AND ld.type = 1
                      )
                    LEFT JOIN lesson_discount ld_pf
                      ON ld_pf.id = (
                        SELECT MIN(ld.id)
                        FROM lesson_discount ld
                        WHERE ld.lessonId = l.id
                          AND ld.type = 2
                      )
                    WHERE l.date >= '2026-06-01 00:00:00'
                      AND ROUND(pl.balance, 2) > 0.09
                      AND NOT EXISTS (
                        SELECT 1
                        FROM invoice_item_lesson iil
                        INNER JOIN invoice_line_item ili
                          ON ili.id = iil.invoiceLineItemId
                         AND ili.isDeleted = 0
                        INNER JOIN invoice inv
                          ON inv.id = ili.invoice_id
                         AND inv.isDeleted = 0
                         AND inv.type = 2
                        WHERE iil.lessonId = l.id
                      )
                      AND (
                        ld_multi.id IS NOT NULL
                        OR ld_line.id IS NOT NULL
                        OR ld_customer.id IS NOT NULL
                        OR ld_pf.id IS NOT NULL
                      )
                  ) base
                ) multi_calc
              ) line_calc
            ) customer_calc
          ) pf_calc
        ) calc
      ) final
      WHERE ROUND(final.oldTotal, 2) = ROUND(final.oldFaultyTotal, 2)
        AND ABS(ROUND(final.correctedTotal - final.oldFaultyTotal, 2)) = 0.01
    `);

    await queryRunner.query(`
      ALTER TABLE tmp_rounding_noninv_pl_fix
        ADD PRIMARY KEY (privateLessonId),
        ADD KEY idx_tmp_rnd_noninv_customer (customerId)
    `);
  }

  private async backupCandidates(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.backupTable}\` (
        migrationName,
        privateLessonId,
        lessonId,
        locationId,
        customerId,
        studentId,
        enrolmentId,
        oldTotal,
        oldBalance,
        oldPaidAmount,
        newTotal,
        newBalance
      )
      SELECT
        ? AS migrationName,
        privateLessonId,
        lessonId,
        locationId,
        customerId,
        studentId,
        enrolmentId,
        oldTotal,
        oldBalance,
        oldPaidAmount,
        newTotal,
        newBalance
      FROM tmp_rounding_noninv_pl_fix
      `,
      [this.migrationName],
    );
  }

  private async updatePrivateLessons(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE private_lesson pl
      INNER JOIN \`${this.backupTable}\` b
        ON b.privateLessonId = pl.id
       AND b.migrationName = ?
      SET
        pl.total = b.newTotal,
        pl.balance = b.newBalance
      `,
      [this.migrationName],
    );
  }

  private async refreshAffectedCustomerBalances(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `
      SELECT DISTINCT customerId
      FROM \`${this.backupTable}\`
      WHERE migrationName = ?
      `,
      [this.migrationName],
    );

    if (!rows.length) {
      return;
    }

    const customerBalanceRepository = new CustomerBalanceCalculationRepository(
      queryRunner.connection as DataSource,
    );

    for (const row of rows) {
      const customerId = Number(row.customerId || 0);
      if (!Number.isFinite(customerId) || customerId <= 0) {
        continue;
      }

      const balance = await customerBalanceRepository.calculateBalance(
        customerId,
        queryRunner.manager,
      );

      await customerBalanceRepository.upsertCustomerAccountBalance(customerId, balance, {
        manager: queryRunner.manager,
      });
    }
  }

  private async dropCandidateTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TEMPORARY TABLE IF EXISTS tmp_rounding_noninv_pl_fix');
  }
}
