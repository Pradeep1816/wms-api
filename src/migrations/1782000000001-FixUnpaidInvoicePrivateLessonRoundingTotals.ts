import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { CustomerBalanceCalculationRepository } from '../customer/repositories/customer-balance-calculation.repository';

export class FixUnpaidInvoicePrivateLessonRoundingTotals1782000000001
  implements MigrationInterface
{
  name = 'FixUnpaidInvoicePrivateLessonRoundingTotals1782000000001';

  private readonly migrationName =
    'FixUnpaidInvoicePrivateLessonRoundingTotals1782000000001';
  private readonly backupTable = 'migration_rounding_unpaid_invoice_backup';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createBackupTable(queryRunner);
    await this.createCandidateTables(queryRunner);
    await this.backupCandidates(queryRunner);
    await this.updateInvoiceLineItems(queryRunner);
    await this.updateInvoices(queryRunner);
    await this.refreshAffectedCustomerBalances(queryRunner);
    await this.dropCandidateTables(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE invoice_line_item ili
      INNER JOIN \`${this.backupTable}\` b
        ON b.invoiceLineItemId = ili.id
       AND b.migrationName = ?
      SET
        ili.netTotal = b.oldLineNetTotal,
        ili.tax_rate = b.oldLineTax
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE invoice inv
      INNER JOIN (
        SELECT
          invoiceId,
          MAX(oldInvoiceSubTotal) AS oldInvoiceSubTotal,
          MAX(oldInvoiceTax) AS oldInvoiceTax,
          MAX(oldInvoiceTotal) AS oldInvoiceTotal,
          MAX(oldInvoiceBalance) AS oldInvoiceBalance,
          MAX(oldInvoiceStatus) AS oldInvoiceStatus,
          MAX(oldInvoicePaidStatus) AS oldInvoicePaidStatus,
          MAX(oldInvoiceTotalCopy) AS oldInvoiceTotalCopy
        FROM \`${this.backupTable}\`
        WHERE migrationName = ?
        GROUP BY invoiceId
      ) b
        ON b.invoiceId = inv.id
      SET
        inv.subTotal = b.oldInvoiceSubTotal,
        inv.tax = b.oldInvoiceTax,
        inv.total = b.oldInvoiceTotal,
        inv.balance = b.oldInvoiceBalance,
        inv.status = b.oldInvoiceStatus,
        inv.paidStatus = b.oldInvoicePaidStatus,
        inv.totalCopy = b.oldInvoiceTotalCopy
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
        \`invoiceLineItemId\` int unsigned NOT NULL,
        \`invoiceId\` int unsigned NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`privateLessonId\` int unsigned NOT NULL,
        \`customerId\` int unsigned NOT NULL,
        \`locationId\` int unsigned NOT NULL,
        \`oldLineNetTotal\` decimal(10,4) NOT NULL,
        \`oldLineTax\` decimal(10,4) NOT NULL,
        \`newLineNetTotal\` decimal(10,4) NOT NULL,
        \`newLineTax\` decimal(10,4) NOT NULL,
        \`oldInvoiceSubTotal\` decimal(10,4) NOT NULL,
        \`oldInvoiceTax\` decimal(10,4) NOT NULL,
        \`oldInvoiceTotal\` decimal(10,4) NOT NULL,
        \`oldInvoiceBalance\` decimal(10,4) NOT NULL,
        \`oldInvoiceStatus\` tinyint unsigned NOT NULL,
        \`oldInvoicePaidStatus\` int NOT NULL,
        \`oldInvoiceTotalCopy\` decimal(10,4) NOT NULL,
        \`newInvoiceSubTotal\` decimal(10,4) NOT NULL,
        \`newInvoiceTax\` decimal(10,4) NOT NULL,
        \`newInvoiceTotal\` decimal(10,4) NOT NULL,
        \`newInvoiceBalance\` decimal(10,4) NOT NULL,
        \`newInvoiceStatus\` tinyint unsigned NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`invoiceLineItemId\`),
        KEY \`idx_rnd_unpaid_inv_invoice\` (\`invoiceId\`),
        KEY \`idx_rnd_unpaid_inv_lesson\` (\`lessonId\`),
        KEY \`idx_rnd_unpaid_inv_customer\` (\`customerId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);
  }

  private async createCandidateTables(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TEMPORARY TABLE IF EXISTS tmp_rounding_unpaid_invoice_line_fix',
    );
    await queryRunner.query(
      'DROP TEMPORARY TABLE IF EXISTS tmp_rounding_unpaid_invoice_total_fix',
    );
    await queryRunner.query(
      'DROP TEMPORARY TABLE IF EXISTS tmp_rounding_unpaid_invoice_ids',
    );

    await queryRunner.query(`
      CREATE TEMPORARY TABLE tmp_rounding_unpaid_invoice_line_fix AS
      SELECT
        final.invoiceLineItemId,
        final.invoiceId,
        final.lessonId,
        final.privateLessonId,
        final.customerId,
        final.locationId,
        final.oldLineNetTotal,
        final.oldLineTax,
        CAST(ROUND(final.correctedNetTotal, 4) AS DECIMAL(10,4)) AS newLineNetTotal,
        CAST(
          ROUND(
            CASE
              WHEN final.oldLineNetTotal = 0 THEN final.oldLineTax
              ELSE final.correctedNetTotal * (final.oldLineTax / final.oldLineNetTotal)
            END,
            4
          ) AS DECIMAL(10,4)
        ) AS newLineTax
      FROM (
        SELECT
          calc.invoiceLineItemId,
          calc.invoiceId,
          calc.lessonId,
          calc.privateLessonId,
          calc.customerId,
          calc.locationId,
          calc.oldLineNetTotal,
          calc.oldLineTax,
          ROUND(calc.grossPrice - calc.correctedTotalDiscountFinal, 2) AS correctedNetTotal,
          ROUND(calc.grossPrice - ROUND(calc.oldTotalDiscountFinal, 2), 2) AS oldFaultyNetTotal
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
                    ili.id AS invoiceLineItemId,
                    inv.id AS invoiceId,
                    l.id AS lessonId,
                    pl.id AS privateLessonId,
                    inv.user_id AS customerId,
                    inv.location_id AS locationId,
                    CAST(ROUND(ili.netTotal, 4) AS DECIMAL(10,4)) AS oldLineNetTotal,
                    CAST(ROUND(COALESCE(ili.tax_rate, 0), 4) AS DECIMAL(10,4)) AS oldLineTax,
                    ROUND(l.programRate * (TIME_TO_SEC(l.duration) / 3600), 2) AS grossPrice,
                    ild_multi.id AS multiDiscountId,
                    COALESCE(ild_multi.value, 0) AS multiDiscountValue,
                    COALESCE(ild_multi.valueType, 0) AS multiDiscountValueType,
                    ild_line.id AS lineDiscountId,
                    COALESCE(ild_line.value, 0) AS lineDiscountValue,
                    COALESCE(ild_line.valueType, 0) AS lineDiscountValueType,
                    ild_customer.id AS customerDiscountId,
                    COALESCE(ild_customer.value, 0) AS customerDiscountValue,
                    COALESCE(ild_customer.valueType, 1) AS customerDiscountValueType,
                    ild_pf.id AS pfDiscountId,
                    COALESCE(ild_pf.value, 0) AS pfDiscountValue,
                    COALESCE(ild_pf.valueType, 1) AS pfDiscountValueType
                  FROM invoice_item_lesson iil
                  INNER JOIN invoice_line_item ili
                    ON ili.id = iil.invoiceLineItemId
                   AND ili.isDeleted = 0
                  INNER JOIN invoice inv
                    ON inv.id = ili.invoice_id
                   AND inv.isDeleted = 0
                   AND COALESCE(inv.isCanceled, 0) = 0
                   AND COALESCE(inv.isVoid, 0) = 0
                   AND inv.type = 2
                   AND ROUND(inv.balance, 2) > 0.09
                  INNER JOIN lesson l
                    ON l.id = iil.lessonId
                   AND l.isDeleted = 0
                   AND l.isConfirmed = 1
                   AND l.status <> 4
                  INNER JOIN private_lesson pl
                    ON pl.lessonId = l.id
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
                  LEFT JOIN invoice_line_item_discount ild_multi
                    ON ild_multi.id = (
                      SELECT MIN(ild.id)
                      FROM invoice_line_item_discount ild
                      WHERE ild.invoiceLineItemId = ili.id
                        AND ild.type = 3
                    )
                  LEFT JOIN invoice_line_item_discount ild_line
                    ON ild_line.id = (
                      SELECT MIN(ild.id)
                      FROM invoice_line_item_discount ild
                      WHERE ild.invoiceLineItemId = ili.id
                        AND ild.type = 4
                    )
                  LEFT JOIN invoice_line_item_discount ild_customer
                    ON ild_customer.id = (
                      SELECT MIN(ild.id)
                      FROM invoice_line_item_discount ild
                      WHERE ild.invoiceLineItemId = ili.id
                        AND ild.type = 1
                    )
                  LEFT JOIN invoice_line_item_discount ild_pf
                    ON ild_pf.id = (
                      SELECT MIN(ild.id)
                      FROM invoice_line_item_discount ild
                      WHERE ild.invoiceLineItemId = ili.id
                        AND ild.type = 2
                    )
                  WHERE (
                    ild_multi.id IS NOT NULL
                    OR ild_line.id IS NOT NULL
                    OR ild_customer.id IS NOT NULL
                    OR ild_pf.id IS NOT NULL
                  )
                ) base
              ) multi_calc
            ) line_calc
          ) customer_calc
        ) calc
      ) final
      WHERE ROUND(final.oldLineNetTotal, 2) = ROUND(final.oldFaultyNetTotal, 2)
        AND ABS(ROUND(final.correctedNetTotal - final.oldFaultyNetTotal, 2)) = 0.01
    `);

    await queryRunner.query(`
      ALTER TABLE tmp_rounding_unpaid_invoice_line_fix
        ADD PRIMARY KEY (invoiceLineItemId),
        ADD KEY idx_tmp_rnd_unpaid_inv (invoiceId),
        ADD KEY idx_tmp_rnd_unpaid_customer (customerId)
    `);

    await queryRunner.query(`
      CREATE TEMPORARY TABLE tmp_rounding_unpaid_invoice_ids AS
      SELECT DISTINCT invoiceId
      FROM tmp_rounding_unpaid_invoice_line_fix
    `);

    await queryRunner.query(`
      ALTER TABLE tmp_rounding_unpaid_invoice_ids
        ADD PRIMARY KEY (invoiceId)
    `);

    await queryRunner.query(`
      CREATE TEMPORARY TABLE tmp_rounding_unpaid_invoice_total_fix AS
      SELECT
        inv.id AS invoiceId,
        inv.user_id AS customerId,
        CAST(ROUND(inv.subTotal, 4) AS DECIMAL(10,4)) AS oldInvoiceSubTotal,
        CAST(ROUND(inv.tax, 4) AS DECIMAL(10,4)) AS oldInvoiceTax,
        CAST(ROUND(inv.total, 4) AS DECIMAL(10,4)) AS oldInvoiceTotal,
        CAST(ROUND(inv.balance, 4) AS DECIMAL(10,4)) AS oldInvoiceBalance,
        inv.status AS oldInvoiceStatus,
        inv.paidStatus AS oldInvoicePaidStatus,
        CAST(ROUND(inv.totalCopy, 4) AS DECIMAL(10,4)) AS oldInvoiceTotalCopy,
        CAST(ROUND(SUM(
          CASE
            WHEN tmp.invoiceLineItemId IS NULL THEN COALESCE(ili.netTotal, 0)
            ELSE tmp.newLineNetTotal
          END
        ), 4) AS DECIMAL(10,4)) AS newInvoiceSubTotal,
        CAST(ROUND(SUM(
          CASE
            WHEN tmp.invoiceLineItemId IS NULL THEN COALESCE(ili.tax_rate, 0)
            ELSE tmp.newLineTax
          END
        ), 4) AS DECIMAL(10,4)) AS newInvoiceTax,
        CAST(ROUND(SUM(
          CASE
            WHEN tmp.invoiceLineItemId IS NULL THEN COALESCE(ili.netTotal, 0)
            ELSE tmp.newLineNetTotal
          END
          +
          CASE
            WHEN tmp.invoiceLineItemId IS NULL THEN COALESCE(ili.tax_rate, 0)
            ELSE tmp.newLineTax
          END
        ), 4) AS DECIMAL(10,4)) AS newInvoiceTotal,
        CAST(ROUND(
          SUM(
            CASE
              WHEN tmp.invoiceLineItemId IS NULL THEN COALESCE(ili.netTotal, 0)
              ELSE tmp.newLineNetTotal
            END
            +
            CASE
              WHEN tmp.invoiceLineItemId IS NULL THEN COALESCE(ili.tax_rate, 0)
              ELSE tmp.newLineTax
            END
          )
          - COALESCE(paid.totalPaid, 0),
          4
        ) AS DECIMAL(10,4)) AS newInvoiceBalance,
        CASE
          WHEN ROUND(
            SUM(
              CASE
                WHEN tmp.invoiceLineItemId IS NULL THEN COALESCE(ili.netTotal, 0)
                ELSE tmp.newLineNetTotal
              END
              +
              CASE
                WHEN tmp.invoiceLineItemId IS NULL THEN COALESCE(ili.tax_rate, 0)
                ELSE tmp.newLineTax
              END
            )
            - COALESCE(paid.totalPaid, 0),
            2
          ) > 0.09 THEN 1
          WHEN ROUND(
            SUM(
              CASE
                WHEN tmp.invoiceLineItemId IS NULL THEN COALESCE(ili.netTotal, 0)
                ELSE tmp.newLineNetTotal
              END
              +
              CASE
                WHEN tmp.invoiceLineItemId IS NULL THEN COALESCE(ili.tax_rate, 0)
                ELSE tmp.newLineTax
              END
            )
            - COALESCE(paid.totalPaid, 0),
            2
          ) < -0.09 THEN 3
          ELSE 2
        END AS newInvoiceStatus
      FROM invoice inv
      INNER JOIN invoice_line_item ili
        ON ili.invoice_id = inv.id
       AND ili.isDeleted = 0
      INNER JOIN tmp_rounding_unpaid_invoice_ids affected
        ON affected.invoiceId = inv.id
      LEFT JOIN tmp_rounding_unpaid_invoice_line_fix tmp
        ON tmp.invoiceLineItemId = ili.id
      LEFT JOIN (
        SELECT
          ip.invoice_id AS invoiceId,
          ROUND(SUM(ip.amount), 4) AS totalPaid
        FROM invoice_payment ip
        INNER JOIN payment p
          ON p.id = ip.payment_id
         AND p.isDeleted = 0
        WHERE ip.isDeleted = 0
        GROUP BY ip.invoice_id
      ) paid
        ON paid.invoiceId = inv.id
      GROUP BY
        inv.id,
        inv.user_id,
        inv.subTotal,
        inv.tax,
        inv.total,
        inv.balance,
        inv.status,
        inv.paidStatus,
        inv.totalCopy,
        paid.totalPaid
    `);

    await queryRunner.query(`
      ALTER TABLE tmp_rounding_unpaid_invoice_total_fix
        ADD PRIMARY KEY (invoiceId),
        ADD KEY idx_tmp_rnd_unpaid_total_customer (customerId)
    `);
  }

  private async backupCandidates(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.backupTable}\` (
        migrationName,
        invoiceLineItemId,
        invoiceId,
        lessonId,
        privateLessonId,
        customerId,
        locationId,
        oldLineNetTotal,
        oldLineTax,
        newLineNetTotal,
        newLineTax,
        oldInvoiceSubTotal,
        oldInvoiceTax,
        oldInvoiceTotal,
        oldInvoiceBalance,
        oldInvoiceStatus,
        oldInvoicePaidStatus,
        oldInvoiceTotalCopy,
        newInvoiceSubTotal,
        newInvoiceTax,
        newInvoiceTotal,
        newInvoiceBalance,
        newInvoiceStatus
      )
      SELECT
        ? AS migrationName,
        line.invoiceLineItemId,
        line.invoiceId,
        line.lessonId,
        line.privateLessonId,
        line.customerId,
        line.locationId,
        line.oldLineNetTotal,
        line.oldLineTax,
        line.newLineNetTotal,
        line.newLineTax,
        total.oldInvoiceSubTotal,
        total.oldInvoiceTax,
        total.oldInvoiceTotal,
        total.oldInvoiceBalance,
        total.oldInvoiceStatus,
        total.oldInvoicePaidStatus,
        total.oldInvoiceTotalCopy,
        total.newInvoiceSubTotal,
        total.newInvoiceTax,
        total.newInvoiceTotal,
        total.newInvoiceBalance,
        total.newInvoiceStatus
      FROM tmp_rounding_unpaid_invoice_line_fix line
      INNER JOIN tmp_rounding_unpaid_invoice_total_fix total
        ON total.invoiceId = line.invoiceId
      `,
      [this.migrationName],
    );
  }

  private async updateInvoiceLineItems(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE invoice_line_item ili
      INNER JOIN \`${this.backupTable}\` b
        ON b.invoiceLineItemId = ili.id
       AND b.migrationName = ?
      SET
        ili.netTotal = b.newLineNetTotal,
        ili.tax_rate = b.newLineTax
      `,
      [this.migrationName],
    );
  }

  private async updateInvoices(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE invoice inv
      INNER JOIN (
        SELECT
          invoiceId,
          MAX(newInvoiceSubTotal) AS newInvoiceSubTotal,
          MAX(newInvoiceTax) AS newInvoiceTax,
          MAX(newInvoiceTotal) AS newInvoiceTotal,
          MAX(newInvoiceBalance) AS newInvoiceBalance,
          MAX(newInvoiceStatus) AS newInvoiceStatus
        FROM \`${this.backupTable}\`
        WHERE migrationName = ?
        GROUP BY invoiceId
      ) b
        ON b.invoiceId = inv.id
      SET
        inv.subTotal = b.newInvoiceSubTotal,
        inv.tax = b.newInvoiceTax,
        inv.total = b.newInvoiceTotal,
        inv.balance = b.newInvoiceBalance,
        inv.status = b.newInvoiceStatus
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

  private async dropCandidateTables(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TEMPORARY TABLE IF EXISTS tmp_rounding_unpaid_invoice_total_fix',
    );
    await queryRunner.query(
      'DROP TEMPORARY TABLE IF EXISTS tmp_rounding_unpaid_invoice_ids',
    );
    await queryRunner.query(
      'DROP TEMPORARY TABLE IF EXISTS tmp_rounding_unpaid_invoice_line_fix',
    );
  }
}
