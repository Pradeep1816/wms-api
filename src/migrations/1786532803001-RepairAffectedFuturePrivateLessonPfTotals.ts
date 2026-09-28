import { MigrationInterface, QueryRunner } from 'typeorm';
import { CustomerBalanceCalculationRepository } from '../customer/repositories/customer-balance-calculation.repository';

export class RepairAffectedFuturePrivateLessonPfTotals1786532803001 implements MigrationInterface {
  name = 'RepairAffectedFuturePrivateLessonPfTotals1786532803001';

  private readonly migrationName =
    'RepairAffectedFuturePrivateLessonPfTotals1786532803001';
  private readonly backupTable =
    'migration_affected_future_pf_lesson_total_backup';
  private readonly auditedCandidateCount = 239;
  private readonly affectedEnrolmentIds = [33109, 33237, 33510] as const;
  private readonly auditedLessonIds = [
    5255528, 5255529, 5255530, 5255531, 5255532, 5255533, 5255534, 5255535,
    5255536, 5255537, 5255538, 5255539, 5255540, 5255541, 5255542, 5255543,
    5255544, 5255545, 5255546, 5255547, 5255548, 5255549, 5255550, 5255551,
    5255552, 5255553, 5255554, 5255555, 5255556, 5255557, 5255558, 5255559,
    5255560, 5255561, 5255562, 5255563, 5255564, 5255565, 5255566, 5255567,
    5255568, 5255569, 5255570, 5255571, 5255572, 5255573, 5255574, 5255575,
    5255576, 5255577, 5255578, 5255579, 5255580, 5255581, 5255582, 5255583,
    5255584, 5255585, 5255586, 5255587, 5255588, 5255589, 5255590, 5255591,
    5255592, 5255593, 5255594, 5255595, 5255596, 5255597, 5255598, 5255599,
    5255600, 5255601, 5255602, 5255603, 5255604, 5255605, 5255606, 5255607,
    5255608, 5255609, 5255610, 5196798, 5196799, 5196800, 5196801, 5196802,
    5196803, 5196804, 5196805, 5196806, 5196807, 5196808, 5196809, 5196810,
    5196811, 5196812, 5196813, 5196814, 5196815, 5196816, 5196817, 5196818,
    5196819, 5196820, 5196821, 5196822, 5196823, 5196824, 5196825, 5196826,
    5196827, 5196828, 5196829, 5196830, 5196831, 5196832, 5196833, 5196834,
    5196835, 5196836, 5196837, 5196838, 5196839, 5196840, 5196841, 5196842,
    5196843, 5196844, 5196845, 5196846, 5196847, 5196848, 5196849, 5196850,
    5196851, 5196852, 5196853, 5196854, 5196855, 5196856, 5196857, 5196858,
    5196859, 5196860, 5196861, 5196862, 5196863, 5196864, 5196865, 5196866,
    5196867, 5196868, 5196869, 5254404, 5254405, 5254406, 5254407, 5254408,
    5254409, 5254410, 5254411, 5254412, 5254413, 5254414, 5254415, 5254416,
    5254417, 5254418, 5254419, 5254420, 5254421, 5254422, 5254423, 5254424,
    5254425, 5254426, 5254427, 5254428, 5254429, 5254430, 5254431, 5254432,
    5254433, 5254434, 5254435, 5254436, 5254437, 5254438, 5254439, 5254440,
    5254441, 5254442, 5254443, 5254444, 5254445, 5254446, 5254447, 5254448,
    5254449, 5254450, 5254451, 5254452, 5254453, 5254454, 5254455, 5254456,
    5254457, 5254458, 5254459, 5254460, 5254461, 5254462, 5254463, 5254464,
    5254465, 5254466, 5254467, 5254468, 5254469, 5254470, 5254471, 5254472,
    5254473, 5254474, 5254475, 5254476, 5254477, 5254478, 5254479, 5254480,
    5254481, 5254482, 5254483, 5254484, 5254485, 5254486, 5254487,
  ] as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    this.assertAuditedLessonIds();
    await this.createBackupTable(queryRunner);
    await this.assertNoExistingBackup(queryRunner);
    await this.backupEligibleCandidates(queryRunner);
    const candidateCount = await this.assertBackupWithinAuditedScope(queryRunner);
    await this.assertCandidatesStillEligible(
      queryRunner,
      'before update',
      candidateCount,
    );
    await this.updatePrivateLessonTotals(queryRunner);
    await this.assertRepairApplied(queryRunner, candidateCount);
    await this.refreshAffectedCustomerBalances(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const candidateCount = await this.getBackupRowCount(queryRunner);
    await this.assertRepairApplied(queryRunner, candidateCount);
    await queryRunner.query(
      `
      UPDATE private_lesson pl
      INNER JOIN \`${this.backupTable}\` b
        ON b.privateLessonId = pl.id
       AND b.migrationName = ?
      SET
        pl.total = b.oldTotal,
        pl.balance = b.oldBalance
      WHERE ABS(pl.total - b.newTotal) < 0.00005
        AND ABS(pl.balance - b.newBalance) < 0.00005
      `,
      [this.migrationName],
    );
    await this.assertRollbackApplied(queryRunner, candidateCount);
    await this.refreshAffectedCustomerBalances(queryRunner);
    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }

  private assertAuditedLessonIds(): void {
    const uniqueIds = new Set(this.auditedLessonIds);
    if (
      this.auditedLessonIds.length !== this.auditedCandidateCount ||
      uniqueIds.size !== this.auditedCandidateCount
    ) {
      throw new Error(
        `${this.migrationName}: audited lesson ID list must contain exactly ${this.auditedCandidateCount} unique IDs`,
      );
    }
  }

  private auditedLessonIdList(): string {
    return this.auditedLessonIds.join(', ');
  }

  private affectedEnrolmentIdList(): string {
    return this.affectedEnrolmentIds.join(', ');
  }

  private async createBackupTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`privateLessonId\` int unsigned NOT NULL,
        \`enrolmentId\` int unsigned NOT NULL,
        \`pfLessonDiscountId\` int unsigned NOT NULL,
        \`pfValue\` decimal(10,4) NOT NULL,
        \`pfValueType\` tinyint(1) NOT NULL,
        \`lessonDate\` datetime NOT NULL,
        \`programRate\` decimal(10,4) NOT NULL,
        \`duration\` time NOT NULL,
        \`tax\` decimal(10,4) NOT NULL,
        \`oldTotal\` decimal(10,4) NOT NULL,
        \`oldBalance\` decimal(10,4) NOT NULL,
        \`newTotal\` decimal(10,4) NOT NULL,
        \`newBalance\` decimal(10,4) NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonId\`),
        KEY \`idx_future_pf_total_bk_enrol\` (\`enrolmentId\`),
        KEY \`idx_future_pf_total_bk_private\` (\`privateLessonId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);
  }

  private async assertNoExistingBackup(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT COUNT(*) AS rowCount FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    )) as Array<{ rowCount: number | string }>;

    if (Number(rows[0]?.rowCount ?? 0) !== 0) {
      throw new Error(
        `${this.migrationName}: an earlier unrecorded attempt left backup rows; review them before retrying`,
      );
    }
  }

  private async backupEligibleCandidates(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const correctTotalExpression = `
      ROUND(
        ROUND(l.programRate * TIME_TO_SEC(l.duration) / 3600, 2)
        * (1 - pf.value / 100)
        + l.tax,
        2
      )
    `;
    const incorrectDollarTotalExpression = `
      ROUND(
        ROUND(l.programRate * TIME_TO_SEC(l.duration) / 3600, 2)
        - pf.value
        + l.tax,
        2
      )
    `;

    await queryRunner.query(
      `
      INSERT INTO \`${this.backupTable}\` (
        migrationName,
        lessonId,
        privateLessonId,
        enrolmentId,
        pfLessonDiscountId,
        pfValue,
        pfValueType,
        lessonDate,
        programRate,
        duration,
        tax,
        oldTotal,
        oldBalance,
        newTotal,
        newBalance
      )
      SELECT
        ? AS migrationName,
        l.id AS lessonId,
        pl.id AS privateLessonId,
        pf.enrolmentId,
        pf.id AS pfLessonDiscountId,
        pf.value AS pfValue,
        pf.valueType AS pfValueType,
        l.date AS lessonDate,
        l.programRate,
        l.duration,
        l.tax,
        pl.total AS oldTotal,
        pl.balance AS oldBalance,
        ${correctTotalExpression} AS newTotal,
        ROUND(
          pl.balance + (${correctTotalExpression} - pl.total),
          4
        ) AS newBalance
      FROM lesson l
      INNER JOIN private_lesson pl
        ON pl.lessonId = l.id
      INNER JOIN lesson_discount pf
        ON pf.lessonId = l.id
       AND pf.type = 2
      INNER JOIN enrolment e
        ON e.id = pf.enrolmentId
      WHERE l.id IN (${this.auditedLessonIdList()})
        AND pf.enrolmentId IN (${this.affectedEnrolmentIdList()})
        AND pf.value IN (3, 6, 10)
        AND pf.valueType = 1
        AND l.date >= NOW()
        AND l.type = 1
        AND l.status IN (1, 2)
        AND l.isConfirmed = 1
        AND l.isDeleted = 0
        AND e.isConfirmed = 1
        AND e.isDeleted = 0
        AND pl.balance > 0
        AND ABS(pl.balance - pl.total) < 0.005
        AND (
          SELECT COUNT(*)
          FROM lesson_discount all_ld
          WHERE all_ld.lessonId = l.id
        ) = 1
        AND NOT EXISTS (
          SELECT 1
          FROM lesson_payment lp
          LEFT JOIN payment p
            ON p.id = lp.paymentId
          WHERE lp.lessonId = l.id
            AND lp.isDeleted = 0
            AND COALESCE(p.isDeleted, 0) = 0
            AND ABS(lp.amount) > 0.00005
        )
        AND NOT EXISTS (
          SELECT 1
          FROM invoice_item_lesson iil
          WHERE iil.lessonId = l.id
        )
        AND ABS(pl.total - (${incorrectDollarTotalExpression})) < 0.005
        AND ABS(pl.total - (${correctTotalExpression})) >= 0.005
      `,
      [this.migrationName],
    );
  }

  /**
   * The audited lesson ID list is the immutable repair boundary. Individual
   * environments can legitimately contain only a subset of those lessons (for
   * example, an older dev dump or a lesson that has since been paid/invoiced).
   * Validate that every backed-up row remains inside that boundary and is an
   * undercharge, then use the actual backup count for all later assertions.
   */
  private async assertBackupWithinAuditedScope(
    queryRunner: QueryRunner,
  ): Promise<number> {
    const rows = (await queryRunner.query(
      `
      SELECT
        COUNT(*) AS candidateCount,
        SUM(
          CASE
            WHEN lessonId NOT IN (${this.auditedLessonIdList()})
              OR enrolmentId NOT IN (${this.affectedEnrolmentIdList()})
            THEN 1 ELSE 0
          END
        ) AS outsideAuditedScope,
        SUM(
          CASE
            WHEN newTotal <= oldTotal
              OR newBalance <= oldBalance
            THEN 1 ELSE 0
          END
        ) AS nonPositiveCorrections
      FROM \`${this.backupTable}\`
      WHERE migrationName = ?
      `,
      [this.migrationName],
    )) as Array<{
      candidateCount: number | string;
      outsideAuditedScope: number | string | null;
      nonPositiveCorrections: number | string | null;
    }>;
    const [result] = rows;

    const candidateCount = Number(result?.candidateCount ?? 0);
    const outsideAuditedScope = Number(result?.outsideAuditedScope ?? 0);
    const nonPositiveCorrections = Number(result?.nonPositiveCorrections ?? 0);

    if (candidateCount > this.auditedCandidateCount) {
      throw new Error(
        `${this.migrationName}: found ${candidateCount} candidates inside an audited boundary of ${this.auditedCandidateCount} lessons`,
      );
    }
    if (outsideAuditedScope !== 0) {
      throw new Error(
        `${this.migrationName}: backup contains ${outsideAuditedScope} lessons outside the audited repair scope`,
      );
    }
    if (nonPositiveCorrections !== 0) {
      throw new Error(
        `${this.migrationName}: backup contains ${nonPositiveCorrections} corrections that do not increase both total and balance`,
      );
    }

    return candidateCount;
  }

  private async getBackupRowCount(queryRunner: QueryRunner): Promise<number> {
    const rows = (await queryRunner.query(
      `SELECT COUNT(*) AS rowCount FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    )) as Array<{ rowCount: number | string }>;

    return Number(rows[0]?.rowCount ?? 0);
  }

  private async assertCandidatesStillEligible(
    queryRunner: QueryRunner,
    stage: string,
    expectedCount: number,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `
      SELECT COUNT(*) AS eligibleCount
      FROM \`${this.backupTable}\` b
      INNER JOIN private_lesson pl
        ON pl.id = b.privateLessonId
      INNER JOIN lesson l
        ON l.id = b.lessonId
      INNER JOIN lesson_discount pf
        ON pf.id = b.pfLessonDiscountId
      INNER JOIN enrolment e
        ON e.id = b.enrolmentId
      WHERE b.migrationName = ?
        AND l.date >= NOW()
        AND l.type = 1
        AND l.status IN (1, 2)
        AND l.isConfirmed = 1
        AND l.isDeleted = 0
        AND e.isConfirmed = 1
        AND e.isDeleted = 0
        AND pf.type = 2
        AND pf.enrolmentId = b.enrolmentId
        AND ABS(pf.value - b.pfValue) < 0.00005
        AND pf.valueType = b.pfValueType
        AND b.pfValueType = 1
        AND l.date = b.lessonDate
        AND ABS(l.programRate - b.programRate) < 0.00005
        AND l.duration = b.duration
        AND ABS(l.tax - b.tax) < 0.00005
        AND ABS(pl.total - b.oldTotal) < 0.00005
        AND ABS(pl.balance - b.oldBalance) < 0.00005
        AND (
          SELECT COUNT(*)
          FROM lesson_discount all_ld
          WHERE all_ld.lessonId = l.id
        ) = 1
        AND NOT EXISTS (
          SELECT 1
          FROM lesson_payment lp
          LEFT JOIN payment p
            ON p.id = lp.paymentId
          WHERE lp.lessonId = l.id
            AND lp.isDeleted = 0
            AND COALESCE(p.isDeleted, 0) = 0
            AND ABS(lp.amount) > 0.00005
        )
        AND NOT EXISTS (
          SELECT 1
          FROM invoice_item_lesson iil
          WHERE iil.lessonId = l.id
        )
      `,
      [this.migrationName],
    )) as Array<{ eligibleCount: number | string }>;
    const [result] = rows;

    const eligibleCount = Number(result?.eligibleCount ?? 0);
    if (eligibleCount !== expectedCount) {
      throw new Error(
        `${this.migrationName}: ${stage} safety check found ${eligibleCount} of ${expectedCount} backed-up lessons eligible`,
      );
    }
  }

  private async updatePrivateLessonTotals(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(
      `
      UPDATE private_lesson pl
      INNER JOIN \`${this.backupTable}\` b
        ON b.privateLessonId = pl.id
       AND b.migrationName = ?
      INNER JOIN lesson l
        ON l.id = b.lessonId
      INNER JOIN lesson_discount pf
        ON pf.id = b.pfLessonDiscountId
      INNER JOIN enrolment e
        ON e.id = b.enrolmentId
      SET
        pl.total = b.newTotal,
        pl.balance = b.newBalance
      WHERE l.date >= NOW()
        AND l.type = 1
        AND l.status IN (1, 2)
        AND l.isConfirmed = 1
        AND l.isDeleted = 0
        AND e.isConfirmed = 1
        AND e.isDeleted = 0
        AND pf.type = 2
        AND pf.enrolmentId = b.enrolmentId
        AND ABS(pf.value - b.pfValue) < 0.00005
        AND pf.valueType = b.pfValueType
        AND b.pfValueType = 1
        AND l.date = b.lessonDate
        AND ABS(l.programRate - b.programRate) < 0.00005
        AND l.duration = b.duration
        AND ABS(l.tax - b.tax) < 0.00005
        AND ABS(pl.total - b.oldTotal) < 0.00005
        AND ABS(pl.balance - b.oldBalance) < 0.00005
        AND (
          SELECT COUNT(*)
          FROM lesson_discount all_ld
          WHERE all_ld.lessonId = l.id
        ) = 1
        AND NOT EXISTS (
          SELECT 1
          FROM lesson_payment lp
          LEFT JOIN payment p
            ON p.id = lp.paymentId
          WHERE lp.lessonId = l.id
            AND lp.isDeleted = 0
            AND COALESCE(p.isDeleted, 0) = 0
            AND ABS(lp.amount) > 0.00005
        )
        AND NOT EXISTS (
          SELECT 1
          FROM invoice_item_lesson iil
          WHERE iil.lessonId = l.id
        )
      `,
      [this.migrationName],
    );
  }

  private async assertRepairApplied(
    queryRunner: QueryRunner,
    expectedCount: number,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `
      SELECT COUNT(*) AS repairedCount
      FROM \`${this.backupTable}\` b
      INNER JOIN private_lesson pl
        ON pl.id = b.privateLessonId
      WHERE b.migrationName = ?
        AND ABS(pl.total - b.newTotal) < 0.00005
        AND ABS(pl.balance - b.newBalance) < 0.00005
      `,
      [this.migrationName],
    )) as Array<{ repairedCount: number | string }>;
    const [result] = rows;

    const repairedCount = Number(result?.repairedCount ?? 0);
    if (repairedCount !== expectedCount) {
      throw new Error(
        `${this.migrationName}: expected ${expectedCount} repaired lessons, found ${repairedCount}`,
      );
    }
  }

  private async assertRollbackApplied(
    queryRunner: QueryRunner,
    expectedCount: number,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `
      SELECT COUNT(*) AS restoredCount
      FROM \`${this.backupTable}\` b
      INNER JOIN private_lesson pl
        ON pl.id = b.privateLessonId
      WHERE b.migrationName = ?
        AND ABS(pl.total - b.oldTotal) < 0.00005
        AND ABS(pl.balance - b.oldBalance) < 0.00005
      `,
      [this.migrationName],
    )) as Array<{ restoredCount: number | string }>;
    const [result] = rows;

    const restoredCount = Number(result?.restoredCount ?? 0);
    if (restoredCount !== expectedCount) {
      throw new Error(
        `${this.migrationName}: expected ${expectedCount} restored lessons, found ${restoredCount}`,
      );
    }
  }

  private async refreshAffectedCustomerBalances(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `
      SELECT DISTINCT s.customer_id AS customerId
      FROM \`${this.backupTable}\` b
      INNER JOIN enrolment e
        ON e.id = b.enrolmentId
      INNER JOIN student s
        ON s.id = e.studentId
      WHERE b.migrationName = ?
        AND s.customer_id IS NOT NULL
      `,
      [this.migrationName],
    )) as Array<{ customerId: number | string }>;

    const balanceRepository = new CustomerBalanceCalculationRepository(
      queryRunner.connection,
    );
    for (const row of rows) {
      const customerId = Number(row.customerId);
      const balance = await balanceRepository.calculateBalance(
        customerId,
        queryRunner.manager,
      );
      await balanceRepository.upsertCustomerAccountBalance(
        customerId,
        balance,
        {
          manager: queryRunner.manager,
        },
      );
    }
  }
}
