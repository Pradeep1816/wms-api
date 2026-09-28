/* A6 metadata-only repair. Run after A6 deployment, with course edits paused. */
import { MigrationInterface, QueryRunner } from 'typeorm';
import * as crypto from 'node:crypto';
import assert from 'node:assert/strict';

const START = '2022-01-24 16:00:00';
const END = '2028-01-22 11:00:00';
const PERIODS = [
  {
    startDate: '2022-01-24',
    endDate: '2026-08-31',
    programRate: 65,
    applyFullDiscount: 0,
  },
  {
    startDate: '2026-09-01',
    endDate: '2028-01-22',
    programRate: 72.5,
    applyFullDiscount: 0,
  },
];
const digest = (value) =>
  crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (message) => {
  throw new Error(`Course 15895 repair refused: ${message}`);
};

function plan(s) {
  const c = s.course[0],
    e = s.enrolment[0];
  if (s.course.length !== 1 || s.enrolment.length !== 1 || !c || !e)
    fail('course/enrolment count changed');
  if (
    c.id !== 15895 ||
    c.locationId !== 16 ||
    c.programId !== 68 ||
    c.type !== 1 ||
    c.isDeleted ||
    e.id !== 16085 ||
    e.courseId !== 15895 ||
    e.studentId !== 14389 ||
    e.isDeleted ||
    !e.isConfirmed ||
    s.student[0]?.customer_id !== 9404 ||
    s.location[0]?.slug !== 'richmond-hill' ||
    s.program[0]?.name !== 'Drums Contemporary' ||
    s.program[0]?.pricingCategory !== 'standard'
  )
    fail('identity differs from reviewed case');
  if (e.pricingTier !== 1 || e.keepsPreviousRate !== 0)
    fail('pricing basis changed');
  if (
    !['0000-00-00 00:00:00', START].includes(c.startDate) ||
    c.endDate !== END
  )
    fail('course dates changed');
  if (s.bounds[0]?.firstDate !== START || s.backup[0]?.newStartDate !== START)
    fail('independent date evidence changed or is missing');
  const h = s.history[0];
  if (!h || h.id !== 232 || h.newTier !== 1 || h.effectiveFrom !== '2026-09-01')
    fail('reviewed tier decision is no longer latest');
  if (s.catalog.length !== 1 || Number(s.catalog[0].hourlyRate) !== 72.5)
    fail('published price changed');
  const remaining = [...PERIODS];
  for (const row of s.rates) {
    const i = remaining.findIndex(
      (p) =>
        p.startDate === row.startDate &&
        p.endDate === row.endDate &&
        p.programRate === Number(row.programRate) &&
        Number(row.applyFullDiscount) === 0,
    );
    if (i < 0)
      fail(
        'existing rate period conflicts or is duplicated; no rows will be deleted',
      );
    remaining.splice(i, 1);
  }
  return {
    courseId: 15895,
    enrolmentId: 16085,
    oldStart: c.startDate,
    newStart: START,
    endDate: END,
    insertPeriods: remaining,
    noOp: c.startDate === START && remaining.length === 0,
  };
}

async function inspect(db) {
  const result: Record<string, any[]> = {};
  const queries = {
    course:
      'SELECT *,CAST(startDate AS CHAR) startDate,CAST(endDate AS CHAR) endDate FROM course WHERE id=15895',
    enrolment: 'SELECT * FROM enrolment WHERE courseId=15895 ORDER BY id',
    student: 'SELECT id,customer_id FROM student WHERE id=14389',
    location: 'SELECT id,slug FROM location WHERE id=16',
    program: 'SELECT id,name,pricingCategory FROM program WHERE id=68',
    rates:
      'SELECT *,CAST(startDate AS CHAR) startDate,CAST(endDate AS CHAR) endDate FROM course_program_rate WHERE courseId=15895 ORDER BY startDate,id',
    history:
      'SELECT *,CAST(effectiveFrom AS CHAR) effectiveFrom FROM enrolment_tier_change WHERE enrolmentId=16085 ORDER BY changedOn DESC,id DESC',
    backup:
      "SELECT * FROM migration_invalid_course_dates_backup WHERE courseId=15895 AND migrationName='FixInvalidCourseDates1780986217000'",
    bounds: `SELECT CAST(MIN(date) AS CHAR) firstDate, CAST(MAX(date) AS CHAR) lastDate FROM lesson
      WHERE courseId=15895 AND isDeleted=0 AND YEAR(date) BETWEEN 1000 AND 9999
      AND MONTH(date) BETWEEN 1 AND 12 AND DAYOFMONTH(date) BETWEEN 1 AND DAYOFMONTH(LAST_DAY(date))`,
    catalog: `SELECT * FROM tuition_price WHERE id=(SELECT id FROM tuition_price WHERE isDeleted=0
      AND priceBook='september_2026' AND pricingCategory='standard' AND pricingTier=1 AND durationMinutes=30
      AND (locationId=16 OR locationId IS NULL) AND effectiveFrom<='2026-09-01'
      AND (effectiveTo IS NULL OR effectiveTo>='2026-09-01') ORDER BY locationId DESC,effectiveFrom DESC,id DESC LIMIT 1)`,
    lessons: 'SELECT * FROM lesson WHERE courseId=15895 ORDER BY id',
    privateLessons:
      'SELECT * FROM private_lesson WHERE lessonId IN (SELECT id FROM lesson WHERE courseId=15895) ORDER BY id',
    discounts:
      'SELECT * FROM lesson_discount WHERE lessonId IN (SELECT id FROM lesson WHERE courseId=15895) ORDER BY id',
    allocations:
      'SELECT * FROM lesson_payment WHERE lessonId IN (SELECT id FROM lesson WHERE courseId=15895) ORDER BY id',
    payments:
      'SELECT * FROM payment WHERE id IN (SELECT paymentId FROM lesson_payment WHERE lessonId IN (SELECT id FROM lesson WHERE courseId=15895)) ORDER BY id',
    invoiceLinks:
      'SELECT * FROM invoice_item_lesson WHERE lessonId IN (SELECT id FROM lesson WHERE courseId=15895) ORDER BY id',
    invoiceLines:
      'SELECT * FROM invoice_line_item WHERE id IN (SELECT invoiceLineItemId FROM invoice_item_lesson WHERE lessonId IN (SELECT id FROM lesson WHERE courseId=15895)) ORDER BY id',
    invoices:
      'SELECT * FROM invoice WHERE id IN (SELECT invoice_id FROM invoice_line_item WHERE id IN (SELECT invoiceLineItemId FROM invoice_item_lesson WHERE lessonId IN (SELECT id FROM lesson WHERE courseId=15895))) ORDER BY id',
    account: 'SELECT * FROM customer_account WHERE customerId=9404 ORDER BY id',
    schedules: 'SELECT * FROM course_schedule WHERE courseId=15895 ORDER BY id',
  };
  for (const [key, sql] of Object.entries(queries)) {
    const [rows] = await db.query(sql);
    result[key] = JSON.parse(JSON.stringify(rows));
  }
  return result;
}

function financialHash(s) {
  return digest(
    Object.fromEntries(
      [
        'enrolment',
        'history',
        'lessons',
        'privateLessons',
        'discounts',
        'allocations',
        'payments',
        'invoiceLinks',
        'invoiceLines',
        'invoices',
        'account',
        'schedules',
      ].map((k) => [k, s[k]]),
    ),
  );
}

async function apply(db, before, writeBackup) {
  const proposed = plan(before);
  if (proposed.noOp)
    return { noOp: true, financialHash: financialHash(before) };
  // A durable external backup must succeed before any database mutation.
  await writeBackup(before);
  // MyISAM rate rows cannot be rolled back. Insert only missing, exact periods;
  // a retry can finish an interrupted insertion without deleting existing rows.
  if (proposed.insertPeriods.length) {
    await db.query(
      'INSERT INTO course_program_rate (courseId,startDate,endDate,programRate,applyFullDiscount) VALUES ?',
      [
        proposed.insertPeriods.map((p) => [
          15895,
          p.startDate,
          p.endDate,
          p.programRate,
          0,
        ]),
      ],
    );
  }
  await db.query(
    'UPDATE course SET startDate=? WHERE id=15895 AND CAST(startDate AS CHAR)=? AND endDate=?',
    [START, before.course[0].startDate, END],
  );
  const after = await inspect(db);
  assert.equal(plan(after).noOp, true, 'Repair postcondition failed');
  assert.equal(
    financialHash(after),
    financialHash(before),
    'Financial or unrelated course records changed',
  );
  const oldCourse = { ...before.course[0], startDate: START };
  assert.deepEqual(
    after.course[0],
    oldCourse,
    'Unexpected course-field change',
  );
  return {
    noOp: false,
    insertedPeriods: proposed.insertPeriods.length,
    financialHash: financialHash(after),
    course: after.course[0],
    rates: after.rates,
  };
}

export class RestoreCourse15895PricingMetadata1788955200000 implements MigrationInterface {
  name = 'RestoreCourse15895PricingMetadata1788955200000';
  static plan = plan;
  static inspect = inspect;
  static financialHash = financialHash;
  static predatesDecision(s): boolean {
    // Older dev/staging dumps have this course but no September pricing decision.
    // They must not be opted into Tier 1 by a production data repair.
    return (
      s.course.length === 1 &&
      s.enrolment.length === 1 &&
      s.course[0].id === 15895 &&
      s.course[0].locationId === 16 &&
      s.course[0].programId === 68 &&
      s.enrolment[0].id === 16085 &&
      s.enrolment[0].studentId === 14389 &&
      s.enrolment[0].pricingTier === null &&
      s.enrolment[0].keepsPreviousRate === 0 &&
      s.history.length === 0
    );
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    // The adapter preserves mysql2's tuple interface for the shared inspection.
    const db = {
      query: async (sql: string, parameters?: any[]) => [
        await queryRunner.query(sql, parameters),
      ],
    };
    const [courses] = await db.query('SELECT id FROM course WHERE id=15895');
    if (courses.length === 0) return; // Fresh installations have no historical case.
    const before = await inspect(db);
    if (RestoreCourse15895PricingMetadata1788955200000.predatesDecision(before))
      return;
    const proposed = plan(before); // Refuse drift before any DDL or data writes.
    if (proposed.noOp) {
      // Recover a process interruption after the data write but before saving
      // its verified after snapshot. Already repaired external data is a no-op.
      const tables = await queryRunner.query(
        "SELECT 1 present FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='migration_course_15895_metadata_backup'",
      );
      if (tables.length) {
        const saved = await queryRunner.query(
          'SELECT snapshot,afterSnapshot FROM migration_course_15895_metadata_backup WHERE migrationName=?',
          [this.name],
        );
        if (saved.length === 1 && !saved[0].afterSnapshot) {
          const original = JSON.parse(saved[0].snapshot);
          plan(original);
          assert.equal(
            financialHash(original),
            financialHash(before),
            'Financial data changed after interrupted repair',
          );
          await queryRunner.query(
            'UPDATE migration_course_15895_metadata_backup SET afterSnapshot=? WHERE migrationName=?',
            [JSON.stringify(before), this.name],
          );
        }
      }
      return;
    }
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS migration_course_15895_metadata_backup (
      migrationName varchar(190) NOT NULL PRIMARY KEY,
      courseId int NOT NULL,
      snapshot longtext NOT NULL,
      afterSnapshot longtext NULL,
      financialHash char(64) NOT NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
    await apply(db, before, async (snapshot) => {
      // Retain the first snapshot across an interrupted MyISAM repair/retry.
      await queryRunner.query(
        `INSERT IGNORE INTO migration_course_15895_metadata_backup
        (migrationName,courseId,snapshot,financialHash) VALUES (?,?,?,?)`,
        [this.name, 15895, JSON.stringify(snapshot), financialHash(snapshot)],
      );
      const backup = await queryRunner.query(
        'SELECT courseId,snapshot FROM migration_course_15895_metadata_backup WHERE migrationName=?',
        [this.name],
      );
      assert.equal(backup.length, 1, 'Repair backup missing');
      assert.equal(backup[0].courseId, 15895, 'Unexpected backup identity');
      plan(JSON.parse(backup[0].snapshot));
      assert.equal(
        financialHash(JSON.parse(backup[0].snapshot)),
        financialHash(snapshot),
        'Financial data changed since the original backup; manual review required',
      );
      assert.equal(
        digest(await inspect(db)),
        digest(snapshot),
        'Data changed during preflight; rerun with course edits paused',
      );
    });
    await queryRunner.query(
      'UPDATE migration_course_15895_metadata_backup SET afterSnapshot=? WHERE migrationName=?',
      [JSON.stringify(await inspect(db)), this.name],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query(
      "SELECT 1 present FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='migration_course_15895_metadata_backup'",
    );
    if (!tables.length) return;
    const rows = await queryRunner.query(
      'SELECT snapshot,afterSnapshot FROM migration_course_15895_metadata_backup WHERE migrationName=?',
      [this.name],
    );
    if (!rows.length) return;
    assert.equal(rows.length, 1, 'Unexpected backup count');
    const before = JSON.parse(rows[0].snapshot);
    plan(before);
    assert(
      rows[0].afterSnapshot,
      'Apply was interrupted before verification; inspect the retained backup before reverting',
    );
    const after = JSON.parse(rows[0].afterSnapshot);
    assert.equal(
      plan(after).noOp,
      true,
      'Backup after-state is not a complete repair',
    );
    const db = {
      query: async (sql: string, parameters?: any[]) => [
        await queryRunner.query(sql, parameters),
      ],
    };
    const current = await inspect(db);
    // No deletion is attempted after changed payments, lessons or pricing history.
    assert.equal(
      financialHash(current),
      financialHash(after),
      'Financial data changed after repair; refusing rollback',
    );
    assert.deepEqual(
      { ...current.course[0], startDate: after.course[0].startDate },
      after.course[0],
      'Course changed after repair',
    );
    assert(
      [before.course[0].startDate, after.course[0].startDate].includes(
        current.course[0].startDate,
      ),
      'Course start changed after repair',
    );
    const originals = new Map(before.rates.map((row) => [row.id, row]));
    const added = after.rates.filter((row) => !originals.has(row.id));
    for (const row of before.rates)
      assert.deepEqual(
        current.rates.find((r) => r.id === row.id),
        row,
        'Original rate changed or disappeared',
      );
    for (const row of current.rates) {
      const expected = after.rates.find((r) => r.id === row.id);
      assert.deepEqual(row, expected, 'Unexpected rate row; refusing rollback');
    }
    // Capture/relax only the zero-date modes, since restoring the original zero
    // date may be required. Always restore this connection's original SQL mode.
    const [mode] = await queryRunner.query('SELECT @@SESSION.sql_mode sqlMode');
    try {
      await queryRunner.query('SET SESSION sql_mode=?', [
        String(mode.sqlMode)
          .split(',')
          .filter((m) => !['NO_ZERO_DATE', 'NO_ZERO_IN_DATE'].includes(m))
          .join(','),
      ]);
      if (added.length)
        await queryRunner.query(
          'DELETE FROM course_program_rate WHERE courseId=15895 AND id IN (?)',
          [added.map((row) => row.id)],
        );
      await queryRunner.query('UPDATE course SET startDate=? WHERE id=15895', [
        before.course[0].startDate,
      ]);
      const restored = await inspect(db);
      assert.deepEqual(
        restored.course,
        before.course,
        'Original course was not restored',
      );
      assert.deepEqual(
        restored.rates,
        before.rates,
        'Original rate rows were not restored',
      );
      assert.equal(
        financialHash(restored),
        financialHash(before),
        'Rollback changed financial data',
      );
    } finally {
      await queryRunner.query('SET SESSION sql_mode=?', [mode.sqlMode]);
    }
    // Keep the backup table and both snapshots for audit and repeat verification.
  }
}
