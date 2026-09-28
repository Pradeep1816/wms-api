import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixAutoRenewalDuplicateCronRecords1779609600008
  implements MigrationInterface
{
  name = 'FixAutoRenewalDuplicateCronRecords1779609600008';

  private readonly migrationName = 'FixAutoRenewalDuplicateCronRecords1779609600008';
  private readonly autoRenewalBackupTable = 'migration_auto_renewal_dup_ar_backup';
  private readonly autoRenewalLessonsBackupTable =
    'migration_auto_renewal_dup_arl_backup';
  private readonly autoRenewalPaymentCycleBackupTable =
    'migration_auto_renewal_dup_arpc_backup';
  private readonly lessonBackupTable = 'migration_auto_renewal_dup_lesson_backup';
  private readonly privateLessonBackupTable =
    'migration_auto_renewal_dup_private_lesson_backup';
  private readonly lessonDiscountBackupTable =
    'migration_auto_renewal_dup_lesson_discount_backup';
  private readonly lessonHierarchyBackupTable =
    'migration_auto_renewal_dup_lesson_hierarchy_backup';
  private readonly paymentCycleBackupTable =
    'migration_auto_renewal_dup_payment_cycle_backup';
  private readonly paymentCycleLessonBackupTable =
    'migration_auto_renewal_dup_pcl_backup';
  private readonly courseScheduleBackupTable =
    'migration_auto_renewal_dup_course_schedule_backup';
  private readonly courseRateBackupTable =
    'migration_auto_renewal_dup_course_rate_backup';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createBackupTables(queryRunner);
    await this.captureDuplicateAutoRenewals(queryRunner);
    await this.captureRelatedRows(queryRunner);

    await queryRunner.query(
      `
      UPDATE payment_cycle_lesson pcl
      INNER JOIN \`${this.paymentCycleLessonBackupTable}\` b
        ON b.paymentCycleLessonId = pcl.id
       AND b.migrationName = ?
      SET pcl.isDeleted = 1
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE payment_cycle pc
      INNER JOIN \`${this.paymentCycleBackupTable}\` b
        ON b.paymentCycleId = pc.id
       AND b.migrationName = ?
      SET pc.isDeleted = 1
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      DELETE pl
      FROM private_lesson pl
      INNER JOIN \`${this.privateLessonBackupTable}\` b
        ON b.privateLessonId = pl.id
       AND b.migrationName = ?
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      DELETE ld
      FROM lesson_discount ld
      INNER JOIN \`${this.lessonDiscountBackupTable}\` b
        ON b.lessonDiscountId = ld.id
       AND b.migrationName = ?
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      DELETE lh
      FROM lesson_hierarchy lh
      INNER JOIN \`${this.lessonHierarchyBackupTable}\` b
        ON b.lessonId = lh.lessonId
       AND b.childLessonId = lh.childLessonId
       AND b.depth = lh.depth
       AND b.migrationName = ?
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      DELETE arl
      FROM auto_renewal_lessons arl
      INNER JOIN \`${this.autoRenewalLessonsBackupTable}\` b
        ON b.autoRenewalLessonId = arl.id
       AND b.migrationName = ?
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      DELETE arpc
      FROM auto_renewal_payment_cycle arpc
      INNER JOIN \`${this.autoRenewalPaymentCycleBackupTable}\` b
        ON b.autoRenewalPaymentCycleId = arpc.id
       AND b.migrationName = ?
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      DELETE cs
      FROM course_schedule cs
      INNER JOIN \`${this.courseScheduleBackupTable}\` b
        ON b.courseScheduleId = cs.id
       AND b.migrationName = ?
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      DELETE cpr
      FROM course_program_rate cpr
      INNER JOIN \`${this.courseRateBackupTable}\` b
        ON b.courseProgramRateId = cpr.id
       AND b.migrationName = ?
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      DELETE ar
      FROM auto_renewal ar
      INNER JOIN \`${this.autoRenewalBackupTable}\` b
        ON b.autoRenewalId = ar.id
       AND b.migrationName = ?
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE lesson l
      INNER JOIN \`${this.lessonBackupTable}\` b
        ON b.lessonId = l.id
       AND b.migrationName = ?
      SET
        l.isDeleted = 1,
        l.updatedOn = CURRENT_TIMESTAMP
      `,
      [this.migrationName],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE lesson l
      INNER JOIN \`${this.lessonBackupTable}\` b
        ON b.lessonId = l.id
       AND b.migrationName = ?
      SET
        l.isDeleted = b.oldLessonIsDeleted,
        l.updatedOn = b.oldLessonUpdatedOn
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE payment_cycle pc
      INNER JOIN \`${this.paymentCycleBackupTable}\` b
        ON b.paymentCycleId = pc.id
       AND b.migrationName = ?
      SET pc.isDeleted = b.oldPaymentCycleIsDeleted
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE payment_cycle_lesson pcl
      INNER JOIN \`${this.paymentCycleLessonBackupTable}\` b
        ON b.paymentCycleLessonId = pcl.id
       AND b.migrationName = ?
      SET pcl.isDeleted = b.oldPaymentCycleLessonIsDeleted
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      INSERT IGNORE INTO auto_renewal (
        id,
        enrolmentId,
        paymentFrequency,
        enrolmentEndDateCurrent,
        enrolmentEndDateNew,
        lastPaymentCycleStartDate,
        lastPaymentCycleEndDate,
        createdOn,
        createdByUserId
      )
      SELECT
        autoRenewalId,
        enrolmentId,
        paymentFrequency,
        enrolmentEndDateCurrent,
        enrolmentEndDateNew,
        lastPaymentCycleStartDate,
        lastPaymentCycleEndDate,
        oldAutoRenewalCreatedOn,
        oldAutoRenewalCreatedByUserId
      FROM \`${this.autoRenewalBackupTable}\`
      WHERE migrationName = ?
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      INSERT IGNORE INTO private_lesson (
        id,
        lessonId,
        expiryDate,
        total,
        balance,
        dueDate
      )
      SELECT
        privateLessonId,
        lessonId,
        expiryDate,
        total,
        balance,
        dueDate
      FROM \`${this.privateLessonBackupTable}\`
      WHERE migrationName = ?
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      INSERT IGNORE INTO lesson_discount (
        id,
        lessonId,
        value,
        valueType,
        type,
        enrolmentId
      )
      SELECT
        lessonDiscountId,
        lessonId,
        value,
        valueType,
        type,
        enrolmentId
      FROM \`${this.lessonDiscountBackupTable}\`
      WHERE migrationName = ?
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      INSERT IGNORE INTO lesson_hierarchy (
        lessonId,
        childLessonId,
        depth
      )
      SELECT
        lessonId,
        childLessonId,
        depth
      FROM \`${this.lessonHierarchyBackupTable}\`
      WHERE migrationName = ?
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      INSERT IGNORE INTO course_schedule (
        id,
        courseId,
        day,
        fromTime,
        duration,
        startDate,
        endDate,
        teacherId,
        isRecent
      )
      SELECT
        courseScheduleId,
        courseId,
        day,
        fromTime,
        duration,
        startDate,
        endDate,
        teacherId,
        isRecent
      FROM \`${this.courseScheduleBackupTable}\`
      WHERE migrationName = ?
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      INSERT IGNORE INTO course_program_rate (
        id,
        courseId,
        startDate,
        endDate,
        programRate,
        applyFullDiscount
      )
      SELECT
        courseProgramRateId,
        courseId,
        startDate,
        endDate,
        programRate,
        applyFullDiscount
      FROM \`${this.courseRateBackupTable}\`
      WHERE migrationName = ?
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      INSERT IGNORE INTO auto_renewal_lessons (
        id,
        autoRenewalId,
        lessonId,
        createdOn,
        createdByUserId
      )
      SELECT
        autoRenewalLessonId,
        autoRenewalId,
        lessonId,
        oldAutoRenewalLessonCreatedOn,
        oldAutoRenewalLessonCreatedByUserId
      FROM \`${this.autoRenewalLessonsBackupTable}\`
      WHERE migrationName = ?
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      INSERT IGNORE INTO auto_renewal_payment_cycle (
        id,
        autoRenewalId,
        paymentCycleId,
        createdOn,
        createdByUserId
      )
      SELECT
        autoRenewalPaymentCycleId,
        autoRenewalId,
        paymentCycleId,
        oldAutoRenewalPaymentCycleCreatedOn,
        oldAutoRenewalPaymentCycleCreatedByUserId
      FROM \`${this.autoRenewalPaymentCycleBackupTable}\`
      WHERE migrationName = ?
      `,
      [this.migrationName],
    );

    await this.clearBackupRows(queryRunner);
  }

  private async createBackupTables(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.autoRenewalBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`autoRenewalId\` int NOT NULL,
        \`keepAutoRenewalId\` int NOT NULL,
        \`enrolmentId\` int NOT NULL,
        \`courseId\` int unsigned NOT NULL,
        \`locationId\` int unsigned NOT NULL,
        \`paymentFrequency\` int NOT NULL,
        \`enrolmentEndDateCurrent\` timestamp NOT NULL,
        \`enrolmentEndDateNew\` timestamp NOT NULL,
        \`lastPaymentCycleStartDate\` timestamp NOT NULL,
        \`lastPaymentCycleEndDate\` timestamp NOT NULL,
        \`oldAutoRenewalCreatedOn\` timestamp NULL,
        \`oldAutoRenewalCreatedByUserId\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`autoRenewalId\`),
        KEY \`idx_mard_ar_keep\` (\`keepAutoRenewalId\`),
        KEY \`idx_mard_ar_enrolment\` (\`enrolmentId\`),
        KEY \`idx_mard_ar_course\` (\`courseId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.autoRenewalLessonsBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`autoRenewalLessonId\` int NOT NULL,
        \`autoRenewalId\` int NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`oldAutoRenewalLessonCreatedOn\` timestamp NULL,
        \`oldAutoRenewalLessonCreatedByUserId\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`autoRenewalLessonId\`),
        KEY \`idx_mard_arl_lesson\` (\`lessonId\`),
        KEY \`idx_mard_arl_ar\` (\`autoRenewalId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.autoRenewalPaymentCycleBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`autoRenewalPaymentCycleId\` int NOT NULL,
        \`autoRenewalId\` int NOT NULL,
        \`paymentCycleId\` int unsigned NOT NULL,
        \`oldAutoRenewalPaymentCycleCreatedOn\` timestamp NULL,
        \`oldAutoRenewalPaymentCycleCreatedByUserId\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`autoRenewalPaymentCycleId\`),
        KEY \`idx_mard_arpc_pc\` (\`paymentCycleId\`),
        KEY \`idx_mard_arpc_ar\` (\`autoRenewalId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.lessonBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`oldLessonIsDeleted\` tinyint NOT NULL,
        \`oldLessonUpdatedOn\` timestamp NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.privateLessonBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`privateLessonId\` int unsigned NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`expiryDate\` timestamp NOT NULL,
        \`total\` decimal(10,4) NOT NULL,
        \`balance\` decimal(10,4) NOT NULL,
        \`dueDate\` date NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`privateLessonId\`),
        KEY \`idx_mard_pl_lesson\` (\`lessonId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.lessonDiscountBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonDiscountId\` int NOT NULL,
        \`lessonId\` int NOT NULL,
        \`value\` decimal(10,4) NULL,
        \`valueType\` tinyint(1) NOT NULL,
        \`type\` int NOT NULL,
        \`enrolmentId\` int NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonDiscountId\`),
        KEY \`idx_mard_ld_lesson\` (\`lessonId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.lessonHierarchyBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonId\` int NOT NULL,
        \`childLessonId\` int NOT NULL,
        \`depth\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonId\`, \`childLessonId\`, \`depth\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.paymentCycleBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`paymentCycleId\` int unsigned NOT NULL,
        \`enrolmentId\` int unsigned NOT NULL,
        \`startDate\` date NOT NULL,
        \`endDate\` date NOT NULL,
        \`oldPaymentCycleIsDeleted\` int NOT NULL,
        \`isPreferredPaymentEnabled\` tinyint(1) NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`paymentCycleId\`),
        KEY \`idx_mard_pc_enrolment\` (\`enrolmentId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.paymentCycleLessonBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`paymentCycleLessonId\` int unsigned NOT NULL,
        \`paymentCycleId\` int unsigned NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`oldPaymentCycleLessonIsDeleted\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`paymentCycleLessonId\`),
        KEY \`idx_mard_pcl_pc\` (\`paymentCycleId\`),
        KEY \`idx_mard_pcl_lesson\` (\`lessonId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.courseScheduleBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`courseScheduleId\` int unsigned NOT NULL,
        \`keepCourseScheduleId\` int unsigned NOT NULL,
        \`courseId\` int unsigned NOT NULL,
        \`day\` tinyint unsigned NOT NULL,
        \`fromTime\` time NOT NULL,
        \`duration\` time NOT NULL,
        \`startDate\` timestamp NOT NULL,
        \`endDate\` timestamp NOT NULL,
        \`teacherId\` int NOT NULL,
        \`isRecent\` tinyint(1) NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`courseScheduleId\`),
        KEY \`idx_mard_cs_course\` (\`courseId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.courseRateBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`courseProgramRateId\` int NOT NULL,
        \`keepCourseProgramRateId\` int NOT NULL,
        \`courseId\` int NOT NULL,
        \`startDate\` date NOT NULL,
        \`endDate\` date NOT NULL,
        \`programRate\` decimal(10,2) NOT NULL,
        \`applyFullDiscount\` tinyint(1) NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`courseProgramRateId\`),
        KEY \`idx_mard_cr_course\` (\`courseId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);
  }

  private async captureDuplicateAutoRenewals(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.autoRenewalBackupTable}\` (
        migrationName,
        autoRenewalId,
        keepAutoRenewalId,
        enrolmentId,
        courseId,
        locationId,
        paymentFrequency,
        enrolmentEndDateCurrent,
        enrolmentEndDateNew,
        lastPaymentCycleStartDate,
        lastPaymentCycleEndDate,
        oldAutoRenewalCreatedOn,
        oldAutoRenewalCreatedByUserId
      )
      SELECT
        ? AS migrationName,
        c.autoRenewalId,
        k.keepAutoRenewalId,
        c.enrolmentId,
        c.courseId,
        c.locationId,
        c.paymentFrequency,
        c.enrolmentEndDateCurrent,
        c.enrolmentEndDateNew,
        c.lastPaymentCycleStartDate,
        c.lastPaymentCycleEndDate,
        c.oldAutoRenewalCreatedOn,
        c.oldAutoRenewalCreatedByUserId
      FROM (
        ${this.autoRenewalCandidateSql()}
      ) c
      INNER JOIN (
        SELECT
          enrolmentId,
          paymentFrequency,
          enrolmentEndDateCurrent,
          enrolmentEndDateNew,
          lastPaymentCycleStartDate,
          lastPaymentCycleEndDate,
          MIN(autoRenewalId) AS keepAutoRenewalId
        FROM (
          ${this.autoRenewalCandidateSql()}
        ) groupedCandidates
        GROUP BY
          enrolmentId,
          paymentFrequency,
          enrolmentEndDateCurrent,
          enrolmentEndDateNew,
          lastPaymentCycleStartDate,
          lastPaymentCycleEndDate
        HAVING COUNT(*) > 1
      ) k
        ON k.enrolmentId = c.enrolmentId
       AND k.paymentFrequency = c.paymentFrequency
       AND k.enrolmentEndDateCurrent = c.enrolmentEndDateCurrent
       AND k.enrolmentEndDateNew = c.enrolmentEndDateNew
       AND k.lastPaymentCycleStartDate = c.lastPaymentCycleStartDate
       AND k.lastPaymentCycleEndDate = c.lastPaymentCycleEndDate
      WHERE c.autoRenewalId <> k.keepAutoRenewalId
      `,
      [this.migrationName],
    );
  }

  private async captureRelatedRows(queryRunner: QueryRunner): Promise<void> {
    await this.captureAutoRenewalLinkRows(queryRunner);
    await this.captureLessonRows(queryRunner);
    await this.capturePaymentCycleRows(queryRunner);
    await this.captureDuplicateCourseScheduleRows(queryRunner);
    await this.captureDuplicateCourseRateRows(queryRunner);
  }

  private async captureAutoRenewalLinkRows(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.autoRenewalLessonsBackupTable}\` (
        migrationName,
        autoRenewalLessonId,
        autoRenewalId,
        lessonId,
        oldAutoRenewalLessonCreatedOn,
        oldAutoRenewalLessonCreatedByUserId
      )
      SELECT
        ? AS migrationName,
        arl.id,
        arl.autoRenewalId,
        arl.lessonId,
        arl.createdOn,
        arl.createdByUserId
      FROM auto_renewal_lessons arl
      INNER JOIN \`${this.autoRenewalBackupTable}\` b
        ON b.autoRenewalId = arl.autoRenewalId
       AND b.migrationName = ?
      `,
      [this.migrationName, this.migrationName],
    );

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.autoRenewalPaymentCycleBackupTable}\` (
        migrationName,
        autoRenewalPaymentCycleId,
        autoRenewalId,
        paymentCycleId,
        oldAutoRenewalPaymentCycleCreatedOn,
        oldAutoRenewalPaymentCycleCreatedByUserId
      )
      SELECT
        ? AS migrationName,
        arpc.id,
        arpc.autoRenewalId,
        arpc.paymentCycleId,
        arpc.createdOn,
        arpc.createdByUserId
      FROM auto_renewal_payment_cycle arpc
      INNER JOIN \`${this.autoRenewalBackupTable}\` b
        ON b.autoRenewalId = arpc.autoRenewalId
       AND b.migrationName = ?
      `,
      [this.migrationName, this.migrationName],
    );
  }

  private async captureLessonRows(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.lessonBackupTable}\` (
        migrationName,
        lessonId,
        oldLessonIsDeleted,
        oldLessonUpdatedOn
      )
      SELECT DISTINCT
        ? AS migrationName,
        l.id,
        l.isDeleted,
        l.updatedOn
      FROM lesson l
      INNER JOIN \`${this.autoRenewalLessonsBackupTable}\` arl
        ON arl.lessonId = l.id
       AND arl.migrationName = ?
      WHERE l.isDeleted = 0
      `,
      [this.migrationName, this.migrationName],
    );

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.privateLessonBackupTable}\` (
        migrationName,
        privateLessonId,
        lessonId,
        expiryDate,
        total,
        balance,
        dueDate
      )
      SELECT
        ? AS migrationName,
        pl.id,
        pl.lessonId,
        pl.expiryDate,
        pl.total,
        pl.balance,
        pl.dueDate
      FROM private_lesson pl
      INNER JOIN \`${this.lessonBackupTable}\` b
        ON b.lessonId = pl.lessonId
       AND b.migrationName = ?
      `,
      [this.migrationName, this.migrationName],
    );

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.lessonDiscountBackupTable}\` (
        migrationName,
        lessonDiscountId,
        lessonId,
        value,
        valueType,
        type,
        enrolmentId
      )
      SELECT
        ? AS migrationName,
        ld.id,
        ld.lessonId,
        ld.value,
        ld.valueType,
        ld.type,
        ld.enrolmentId
      FROM lesson_discount ld
      INNER JOIN \`${this.lessonBackupTable}\` b
        ON b.lessonId = ld.lessonId
       AND b.migrationName = ?
      `,
      [this.migrationName, this.migrationName],
    );

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.lessonHierarchyBackupTable}\` (
        migrationName,
        lessonId,
        childLessonId,
        depth
      )
      SELECT DISTINCT
        ? AS migrationName,
        lh.lessonId,
        lh.childLessonId,
        lh.depth
      FROM lesson_hierarchy lh
      INNER JOIN \`${this.lessonBackupTable}\` b
        ON (b.lessonId = lh.lessonId OR b.lessonId = lh.childLessonId)
       AND b.migrationName = ?
      `,
      [this.migrationName, this.migrationName],
    );
  }

  private async capturePaymentCycleRows(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.paymentCycleBackupTable}\` (
        migrationName,
        paymentCycleId,
        enrolmentId,
        startDate,
        endDate,
        oldPaymentCycleIsDeleted,
        isPreferredPaymentEnabled
      )
      SELECT DISTINCT
        ? AS migrationName,
        pc.id,
        pc.enrolmentId,
        pc.startDate,
        pc.endDate,
        pc.isDeleted,
        pc.isPreferredPaymentEnabled
      FROM payment_cycle pc
      INNER JOIN \`${this.autoRenewalPaymentCycleBackupTable}\` arpc
        ON arpc.paymentCycleId = pc.id
       AND arpc.migrationName = ?
      WHERE pc.isDeleted = 0
      `,
      [this.migrationName, this.migrationName],
    );

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.paymentCycleLessonBackupTable}\` (
        migrationName,
        paymentCycleLessonId,
        paymentCycleId,
        lessonId,
        oldPaymentCycleLessonIsDeleted
      )
      SELECT DISTINCT
        ? AS migrationName,
        pcl.id,
        pcl.paymentCycleId,
        pcl.lessonId,
        pcl.isDeleted
      FROM payment_cycle_lesson pcl
      LEFT JOIN \`${this.paymentCycleBackupTable}\` pc
        ON pc.paymentCycleId = pcl.paymentCycleId
       AND pc.migrationName = ?
      LEFT JOIN \`${this.lessonBackupTable}\` l
        ON l.lessonId = pcl.lessonId
       AND l.migrationName = ?
      WHERE pcl.isDeleted = 0
        AND (pc.paymentCycleId IS NOT NULL OR l.lessonId IS NOT NULL)
      `,
      [this.migrationName, this.migrationName, this.migrationName],
    );
  }

  private async captureDuplicateCourseScheduleRows(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.courseScheduleBackupTable}\` (
        migrationName,
        courseScheduleId,
        keepCourseScheduleId,
        courseId,
        day,
        fromTime,
        duration,
        startDate,
        endDate,
        teacherId,
        isRecent
      )
      SELECT
        ? AS migrationName,
        cs.id,
        k.keepCourseScheduleId,
        cs.courseId,
        cs.day,
        cs.fromTime,
        cs.duration,
        cs.startDate,
        cs.endDate,
        cs.teacherId,
        cs.isRecent
      FROM course_schedule cs
      INNER JOIN (
        SELECT
          cs.courseId,
          cs.day,
          cs.fromTime,
          cs.duration,
          cs.startDate,
          cs.endDate,
          cs.teacherId,
          MIN(cs.id) AS keepCourseScheduleId
        FROM course_schedule cs
        INNER JOIN (
          SELECT DISTINCT
            courseId,
            enrolmentEndDateCurrent,
            enrolmentEndDateNew
          FROM \`${this.autoRenewalBackupTable}\`
          WHERE migrationName = ?
        ) b
          ON b.courseId = cs.courseId
         AND DATE(cs.startDate) >= DATE(DATE_ADD(b.enrolmentEndDateCurrent, INTERVAL 1 DAY))
         AND DATE(cs.endDate) <= DATE(b.enrolmentEndDateNew)
        GROUP BY
          cs.courseId,
          cs.day,
          cs.fromTime,
          cs.duration,
          cs.startDate,
          cs.endDate,
          cs.teacherId
        HAVING COUNT(*) > 1
      ) k
        ON k.courseId = cs.courseId
       AND k.day = cs.day
       AND k.fromTime = cs.fromTime
       AND k.duration = cs.duration
       AND k.startDate = cs.startDate
       AND k.endDate = cs.endDate
       AND k.teacherId = cs.teacherId
      WHERE cs.id <> k.keepCourseScheduleId
      `,
      [this.migrationName, this.migrationName],
    );
  }

  private async captureDuplicateCourseRateRows(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.courseRateBackupTable}\` (
        migrationName,
        courseProgramRateId,
        keepCourseProgramRateId,
        courseId,
        startDate,
        endDate,
        programRate,
        applyFullDiscount
      )
      SELECT
        ? AS migrationName,
        cpr.id,
        k.keepCourseProgramRateId,
        cpr.courseId,
        cpr.startDate,
        cpr.endDate,
        cpr.programRate,
        cpr.applyFullDiscount
      FROM course_program_rate cpr
      INNER JOIN (
        SELECT
          cpr.courseId,
          cpr.startDate,
          cpr.endDate,
          cpr.programRate,
          cpr.applyFullDiscount,
          MIN(cpr.id) AS keepCourseProgramRateId
        FROM course_program_rate cpr
        INNER JOIN (
          SELECT DISTINCT
            courseId,
            enrolmentEndDateCurrent,
            enrolmentEndDateNew
          FROM \`${this.autoRenewalBackupTable}\`
          WHERE migrationName = ?
        ) b
          ON b.courseId = cpr.courseId
         AND DATE(cpr.startDate) >= DATE(DATE_ADD(b.enrolmentEndDateCurrent, INTERVAL 1 DAY))
         AND DATE(cpr.endDate) <= DATE(b.enrolmentEndDateNew)
        GROUP BY
          cpr.courseId,
          cpr.startDate,
          cpr.endDate,
          cpr.programRate,
          cpr.applyFullDiscount
        HAVING COUNT(*) > 1
      ) k
        ON k.courseId = cpr.courseId
       AND k.startDate = cpr.startDate
       AND k.endDate = cpr.endDate
       AND k.programRate = cpr.programRate
       AND k.applyFullDiscount = cpr.applyFullDiscount
      WHERE cpr.id <> k.keepCourseProgramRateId
      `,
      [this.migrationName, this.migrationName],
    );
  }

  private autoRenewalCandidateSql(): string {
    return `
      SELECT
        ar.id AS autoRenewalId,
        ar.enrolmentId AS enrolmentId,
        e.courseId AS courseId,
        c.locationId AS locationId,
        ar.paymentFrequency AS paymentFrequency,
        ar.enrolmentEndDateCurrent AS enrolmentEndDateCurrent,
        ar.enrolmentEndDateNew AS enrolmentEndDateNew,
        ar.lastPaymentCycleStartDate AS lastPaymentCycleStartDate,
        ar.lastPaymentCycleEndDate AS lastPaymentCycleEndDate,
        ar.createdOn AS oldAutoRenewalCreatedOn,
        ar.createdByUserId AS oldAutoRenewalCreatedByUserId
      FROM auto_renewal ar
      INNER JOIN enrolment e
        ON e.id = ar.enrolmentId
      INNER JOIN course c
        ON c.id = e.courseId
      WHERE ar.createdByUserId = 727
        AND ar.createdOn >= '2026-05-28 03:00:00'
    `;
  }

  private async clearBackupRows(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      this.courseRateBackupTable,
      this.courseScheduleBackupTable,
      this.paymentCycleLessonBackupTable,
      this.paymentCycleBackupTable,
      this.lessonHierarchyBackupTable,
      this.lessonDiscountBackupTable,
      this.privateLessonBackupTable,
      this.lessonBackupTable,
      this.autoRenewalPaymentCycleBackupTable,
      this.autoRenewalLessonsBackupTable,
      this.autoRenewalBackupTable,
    ]) {
      await queryRunner.query(
        `DELETE FROM \`${table}\` WHERE migrationName = ?`,
        [this.migrationName],
      );
    }
  }
}
