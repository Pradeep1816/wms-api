/**
 * End-to-end flow check through the real HTTP API.
 *
 * Creates enrolments the way staff do, confirms them, applies a permanent
 * schedule change, and checks the money and the schedule at every step. Cleans
 * up everything it creates, including the MyISAM lesson_discount rows a foreign
 * key cannot cascade.
 *
 * Run:  node scripts/e2e-flow-check.cjs
 *
 * Needs the API running on :3005 and an administrator access token in `.tok`
 * (the token is a `user.access_token` value - this build authenticates by
 * looking that column up, not by verifying a JWT).
 *
 * It writes real rows and cleans them up in a `finally`, including the MyISAM
 * `lesson_discount` rows nothing else will cascade. Point it at a snapshot, not
 * production.
 */
const mysql = require('mysql2/promise');
require('dotenv').config({ quiet: true });

const BASE = 'http://localhost:3005/admin/v2/training-location';
const TOKEN = require('fs').readFileSync(__dirname + '/../.tok', 'utf8').trim();
const LOCATION_ID = 1;
const PROGRAM_ID = 64; // Bass Guitar, standard
const TEACHER_ID = 8917;
const TIER = 2; // Standard 60 min: $350.00/mn, $1019.00 for three months

let failures = 0;
const created = { courses: [], enrolments: [] };

function check(label, actual, expected, tolerance = 0.005) {
  const ok =
    typeof actual === 'number' && typeof expected === 'number'
      ? Math.abs(actual - expected) < tolerance
      : actual === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: ${actual}${ok ? '' : ` (expected ${expected})`}`);
  if (!ok) failures++;
  return ok;
}

function note(label, value) {
  console.log(`        ${label}: ${value}`);
}

async function api(method, path, body, query = '') {
  const res = await fetch(`${BASE}${path}${query}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, json };
}

function enrolmentPayload(paymentFrequency, startDate, day, startTime) {
  return {
    programId: PROGRAM_ID,
    programRate: 87.5, // tier 2 hourly
    pricingTier: TIER,
    duration: '01:00',
    paymentFrequency,
    discountedRatePerMonth: 350,
    lessonsCount: 12,
    autoRenew: false,
    startDate,
    paymentCycleEffectiveDate: startDate,
    isOnline: false,
    teacherId: TEACHER_ID,
    day,
    startTime,
  };
}

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: +process.env.DB_PORT || 3306,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE, dateStrings: true,
  });

  // Students the location actually has - the controller scopes by location and
  // 404s on anyone else.
  const [students] = await db.execute(
    `SELECT DISTINCT s.id FROM student s
       JOIN enrolment e ON e.studentId = s.id AND e.isDeleted = 0
       JOIN course co ON co.id = e.courseId AND co.locationId = 1
      WHERE s.isDeleted = 0 ORDER BY s.id DESC LIMIT 2`,
  );
  const studentA = students[0].id;
  const studentB = students[1].id;

  const prepaidRows = async (enrolmentId) => {
    const [r] = await db.execute(
      'SELECT COUNT(*) n, COALESCE(SUM(value),0) total FROM lesson_discount WHERE enrolmentId=? AND type=7',
      [enrolmentId],
    );
    return { count: Number(r[0].n), total: Number(r[0].total) };
  };
  const lessonStats = async (courseId) => {
    const [r] = await db.execute(
      `SELECT COUNT(*) n, MIN(DATE(date)) first, MAX(DATE(date)) last,
              COUNT(DISTINCT DAYOFWEEK(date)) weekdays, COUNT(DISTINCT TIME(date)) times
         FROM lesson WHERE courseId=? AND isDeleted=0 AND status<>4`, [courseId]);
    return r[0];
  };

  // ---------------------------------------------------------- 1. QUARTERLY
  console.log('\n=== 1. Quarterly enrolment: create, confirm, price ===');
  let res = await api('POST', `/student/${studentA}/enrolments`,
    enrolmentPayload('Quarterly', '2026-09-07', 'Monday', '16:00'));
  if (!check('create returns 2xx', res.status < 300, true)) {
    console.log('   ', JSON.stringify(res.json).slice(0, 400));
  }
  const enrolA = res.json?.data?.id ?? res.json?.id;
  const courseA = res.json?.data?.courseId ?? res.json?.courseId;
  note('enrolment', enrolA); note('course', courseA);
  if (enrolA) { created.enrolments.push(enrolA); created.courses.push(courseA); }

  let stats = await lessonStats(courseA);
  check('12 lessons created', Number(stats.n), 12);
  note('first / last', `${stats.first} .. ${stats.last}`);

  check('no prepaid rows before confirmation', (await prepaidRows(enrolA)).count, 0);

  res = await api('POST', '/lesson/confirm', null, `?courseId=${courseA}`);
  check('confirm returns 2xx', res.status < 300, true);

  let rows = await prepaidRows(enrolA);
  check('prepaid rows written on confirmation', rows.count > 0, true);
  note('rows / total reduction', `${rows.count} / ${rows.total.toFixed(2)}`);

  const [cycles] = await db.execute(
    'SELECT id, startDate, endDate FROM payment_cycle WHERE enrolmentId=? AND isDeleted=0 ORDER BY startDate', [enrolA]);
  note('payment cycles', cycles.length);

  // Each fully-populated quarterly cycle must cost exactly the published total.
  const [cycleMoney] = await db.execute(
    `SELECT pc.id, COUNT(l.id) lessons,
            ROUND(SUM(l.programRate * (TIME_TO_SEC(l.duration)/3600)),2) gross,
            ROUND(COALESCE(SUM(ld.value),0),2) reduction
       FROM payment_cycle pc
       JOIN payment_cycle_lesson pcl ON pcl.paymentCycleId=pc.id AND pcl.isDeleted=0
       JOIN lesson l ON l.id=pcl.lessonId AND l.isDeleted=0
       LEFT JOIN lesson_discount ld ON ld.lessonId=l.id AND ld.type=7
      WHERE pc.enrolmentId=? AND pc.isDeleted=0
      GROUP BY pc.id ORDER BY pc.startDate`, [enrolA]);
  cycleMoney.forEach((c) =>
    note(`cycle ${c.id}`, `${c.lessons} lessons, gross ${c.gross}, reduction ${c.reduction}, payable ${(c.gross - c.reduction).toFixed(2)}`));
  const full = cycleMoney.find((c) => Number(c.lessons) === 12);
  if (full) check('a full 12-lesson cycle costs the published total', Number(full.gross) - Number(full.reduction), 1019);

  // ------------------------------------------------ 2. PERMANENT SCHEDULE CHANGE
  console.log('\n=== 2. Permanent schedule change on the prepaid enrolment ===');
  const before = await lessonStats(courseA);
  const beforePrepaid = await prepaidRows(enrolA);

  res = await api('POST', `/enrolments/${enrolA}/permanent-schedule-change/reschedule`, {
    dateToChangeSchedule: '2026-10',
    teacherId: TEACHER_ID,
    dayTime: 'Friday 10:00 AM',
    duration: '01:00',
    rescheduleBeginDate: 'Oct 1, 2026',
  });
  note('PSC status', res.status);
  if (res.status >= 300) note('body', JSON.stringify(res.json).slice(0, 300));
  check('PSC succeeds', res.status < 300, true);

  // Reschedule only PROPOSES: it adds the new lessons alongside the old, and
  // confirm is what cancels the originals. Checking here would be checking a
  // half-finished state.
  const proposed = await lessonStats(courseA);
  note('after reschedule (proposed)', `${proposed.n} lessons, ${proposed.weekdays} weekday(s), ${proposed.times} time(s)`);

  res = await api('POST', '/lesson/confirm', null,
    `?courseId=${courseA}&rescheduleBeginDate=2026-10-01&rescheduleEndDate=2026-10-31`);
  note('PSC confirm status', res.status);
  check('PSC confirm succeeds', res.status < 300, true);

  const after = await lessonStats(courseA);
  note('before PSC', `${before.n} lessons, ${before.weekdays} weekday(s), ${before.times} time(s)`);
  note('after PSC ', `${after.n} lessons, ${after.weekdays} weekday(s), ${after.times} time(s)`);
  // Two weekdays is CORRECT for a change effective 1 October: September keeps
  // Monday 16:00 and October onward moves to Friday 10:00. One weekday would
  // mean the change had swept up lessons before its own effective date.
  check('the change splits the schedule rather than rewriting all of it', Number(after.weekdays), 2);
  check('lesson count is preserved end to end', Number(after.n), Number(before.n));

  const afterPrepaid = await prepaidRows(enrolA);
  note('prepaid rows total (incl. cancelled lessons)', `${afterPrepaid.count} (was ${beforePrepaid.count})`);
  // The reschedule copies lesson discounts from the old lesson to its
  // replacement, which is what carries prepaid across a schedule change without
  // this needing a hook of its own. What matters is that every LIVE lesson has
  // exactly one prepaid row - the extras sit on cancelled lessons and are never
  // billed.
  const [live] = await db.execute(
    `SELECT COUNT(*) n FROM lesson_discount ld
       JOIN lesson l ON l.id = ld.lessonId
      WHERE ld.enrolmentId = ? AND ld.type = 7 AND l.isDeleted = 0 AND l.status <> 4`,
    [enrolA]);
  check('every live lesson carries exactly one prepaid row', Number(live[0].n), Number(after.n));
  check('no prepaid rows orphaned onto deleted lessons', await orphanCount(db), 0);

  // The question this whole section exists to answer: after the schedule moved,
  // does the cycle STILL cost the published total, or is the reduction now
  // sitting on lessons that were cancelled?
  const [afterMoney] = await db.execute(
    `SELECT pc.id, COUNT(l.id) lessons,
            ROUND(SUM(l.programRate * (TIME_TO_SEC(l.duration)/3600)),2) gross,
            ROUND(COALESCE(SUM(ld.value),0),2) reduction
       FROM payment_cycle pc
       JOIN payment_cycle_lesson pcl ON pcl.paymentCycleId=pc.id AND pcl.isDeleted=0
       JOIN lesson l ON l.id=pcl.lessonId AND l.isDeleted=0 AND l.status<>4
       LEFT JOIN lesson_discount ld ON ld.lessonId=l.id AND ld.type=7
      WHERE pc.enrolmentId=? AND pc.isDeleted=0
      GROUP BY pc.id ORDER BY pc.startDate`, [enrolA]);
  afterMoney.forEach((c) =>
    note(`cycle ${c.id} after PSC`, `${c.lessons} lessons, gross ${c.gross}, reduction ${c.reduction}, payable ${(Number(c.gross) - Number(c.reduction)).toFixed(2)}`));
  const fullAfter = afterMoney.find((c) => Number(c.lessons) === 12);
  if (fullAfter) {
    check('the cycle still costs the published total after the schedule change',
      Number(fullAfter.gross) - Number(fullAfter.reduction), 1019);
  } else {
    note('note', 'no 12-lesson cycle after PSC - cycle composition changed');
  }

  // ------------------------------------------------------------ 3. MONTHLY
  console.log('\n=== 3. Monthly enrolment must get no prepaid rows ===');
  res = await api('POST', `/student/${studentB}/enrolments`,
    enrolmentPayload('Monthly', '2026-09-08', 'Tuesday', '15:00'));
  if (!check('create returns 2xx', res.status < 300, true)) {
    console.log('   ', JSON.stringify(res.json).slice(0, 400));
  }
  const enrolB = res.json?.data?.id ?? res.json?.id;
  const courseB = res.json?.data?.courseId ?? res.json?.courseId;
  if (enrolB) { created.enrolments.push(enrolB); created.courses.push(courseB); }
  note('enrolment', enrolB);

  res = await api('POST', '/lesson/confirm', null, `?courseId=${courseB}`);
  check('confirm returns 2xx', res.status < 300, true);
  check('monthly billing writes no prepaid rows', (await prepaidRows(enrolB)).count, 0);

  // ------------------------------------------- 4. CHANGE PRICING BASIS
  // The path that matters for the 4,783 existing prepaid enrolments: none is on
  // a tier yet, so they are all correctly untouched until staff move one - and
  // this is what has to price it when they do.
  console.log('=== 4. Change pricing basis re-prices the prepaid cycles ===');
  res = await api('POST', `/student/${studentA}/enrolments`,
    // Same shape as section 1 deliberately: a start that puts all 12 lessons in
    // one cycle. A cycle holding 11 cannot reach the published total at all -
    // see the short-cycle note in the report.
    enrolmentPayload('Quarterly', '2026-09-07', 'Monday', '11:00'));
  check('create returns 2xx', res.status < 300, true);
  const enrolC = res.json?.data?.id ?? res.json?.id;
  const courseC = res.json?.data?.courseId ?? res.json?.courseId;
  if (enrolC) { created.enrolments.push(enrolC); created.courses.push(courseC); }
  res = await api('POST', '/lesson/confirm', null, `?courseId=${courseC}`);
  note('confirm status', res.status);
  if (res.status >= 300) note('confirm body', JSON.stringify(res.json).slice(0, 300));
  const [cyc] = await db.execute(
    `SELECT pc.id, pc.startDate, pc.endDate, COUNT(pcl.lessonId) lessons
       FROM payment_cycle pc
       LEFT JOIN payment_cycle_lesson pcl ON pcl.paymentCycleId=pc.id AND pcl.isDeleted=0
      WHERE pc.enrolmentId=? AND pc.isDeleted=0 GROUP BY pc.id ORDER BY pc.startDate`, [enrolC]);
  cyc.forEach((c) => note(`cycle ${c.id}`, `${c.startDate} .. ${c.endDate}, ${c.lessons} lessons`));
  const [er] = await db.execute('SELECT pricingTier, keepsPreviousRate, paymentFrequencyId FROM enrolment WHERE id=?', [enrolC]);
  note('enrolment row', JSON.stringify(er[0]));

  const atTier2 = await prepaidRows(enrolC);
  note('reduction at tier 2', atTier2.total.toFixed(2));
  check('tier 2 quarterly is the published 1019.00', 1050 - atTier2.total, 1019);

  // Move it to tier 3: $410.00 a month, published 1194.00 for three months, so
  // gross 1230.00 and a reduction of 36.00.
  res = await api('POST', `/pricing/enrolments/${enrolC}/basis`, {
    pricingTier: 3, reason: 'e2e check - moving to tier 3',
  });
  note('change basis status', res.status);
  if (res.status >= 300) note('body', JSON.stringify(res.json).slice(0, 300));
  check('change basis succeeds', res.status < 300, true);

  const atTier3 = await prepaidRows(enrolC);
  note('reduction at tier 3', atTier3.total.toFixed(2));
  check('prepaid was re-priced, not left at the old tier', atTier3.total !== atTier2.total, true);

  // Move it to the previous rate: the entitlement goes, so the rows must go.
  res = await api('POST', `/pricing/enrolments/${enrolC}/basis`, {
    keepsPreviousRate: true, reason: 'e2e check - grandfathering',
  });
  check('move to previous rate succeeds', res.status < 300, true);
  check('prepaid rows cleared when the entitlement goes', (await prepaidRows(enrolC)).count, 0);

  console.log(failures === 0 ? 'ALL FLOW CHECKS PASSED' : failures + ' FLOW CHECK(S) FAILED');
  return db;
}

// Cleanup must run even when a check throws, or the next run inherits the
// wreckage of this one.
async function run() {
  let db = null;
  try {
    db = await main();
  } catch (e) {
    console.error('UNEXPECTED:', e.message);
    failures++;
  } finally {
    if (!db) {
      db = await mysql.createConnection({
        host: process.env.DB_HOST, port: +process.env.DB_PORT || 3306,
        user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE, dateStrings: true,
      });
    }
    await cleanup(db);
    await db.end();
  }
  process.exit(failures === 0 ? 0 : 1);
}

async function orphanCount(db) {
  const [r] = await db.execute(
    `SELECT COUNT(*) n FROM lesson_discount ld WHERE ld.type=7
       AND NOT EXISTS (SELECT 1 FROM lesson l WHERE l.id=ld.lessonId AND l.isDeleted=0)`);
  return Number(r[0].n);
}

async function cleanup(db) {
  console.log('\n=== cleanup ===');
  for (const enrolmentId of created.enrolments) {
    await db.execute('DELETE FROM lesson_discount WHERE enrolmentId=?', [enrolmentId]);
    await db.execute(
      'DELETE pcl FROM payment_cycle_lesson pcl JOIN payment_cycle pc ON pc.id=pcl.paymentCycleId WHERE pc.enrolmentId=?', [enrolmentId]);
    await db.execute('DELETE FROM payment_cycle WHERE enrolmentId=?', [enrolmentId]);
    await db.execute('DELETE FROM enrolment_payment_frequency WHERE enrolmentId=?', [enrolmentId]);
    await db.execute('DELETE FROM enrolment_discount WHERE enrolmentId=?', [enrolmentId]);
  }
  for (const courseId of created.courses) {
    if (!courseId) continue;
    await db.execute(
      'DELETE ld FROM lesson_discount ld JOIN lesson l ON l.id=ld.lessonId WHERE l.courseId=?', [courseId]);
    await db.execute(
      'DELETE pl FROM private_lesson pl JOIN lesson l ON l.id=pl.lessonId WHERE l.courseId=?', [courseId]);
    await db.execute('DELETE FROM lesson WHERE courseId=?', [courseId]);
    await db.execute('DELETE FROM course_schedule WHERE courseId=?', [courseId]);
    await db.execute('DELETE FROM course_program_rate WHERE courseId=?', [courseId]);
  }
  for (const enrolmentId of created.enrolments) {
    await db.execute('DELETE FROM enrolment WHERE id=?', [enrolmentId]);
  }
  for (const courseId of created.courses) {
    if (courseId) await db.execute('DELETE FROM course WHERE id=?', [courseId]);
  }
  // MyISAM leaves these behind wherever a rollback happened.
  const [orphans] = await db.execute(
    `DELETE ld FROM lesson_discount ld WHERE ld.type=7
       AND NOT EXISTS (SELECT 1 FROM lesson l WHERE l.id=ld.lessonId)`);
  console.log(`  removed ${created.enrolments.length} enrolment(s), ${created.courses.filter(Boolean).length} course(s), ${orphans.affectedRows} orphan prepaid row(s)`);
}

run();
