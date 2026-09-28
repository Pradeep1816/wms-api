// Explicit disposable-copy rehearsal, NOT part of the ordinary unit suite.
// Build first. This applies, reruns, rolls back and reapplies the migration.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { DataSource } = require('typeorm');
const { RepairPricingHistoryTimestamps1792100000000: Repair } = require('../dist/migrations/1792100000000-RepairPricingHistoryTimestamps');
const { inspectHistoryTimestampRepair } = require('../dist/pricing/repairs/pricing-history-timestamp-repair');
const digest = rows => crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');

async function main() {
  assert.equal(process.env.SMW1653_TEST_ALLOW_WRITE, '1', 'Explicit test-write opt-in required');
  assert.ok(['127.0.0.1', 'localhost'].includes(process.env.DB_HOST), 'Loopback only');
  assert.match(process.env.DB_DATABASE || '', /^smw_.*_test$/, 'Disposable test schema only');
  const db = new DataSource({ type:'mysql', host:process.env.DB_HOST, port:Number(process.env.DB_PORT), username:process.env.DB_USERNAME, password:process.env.DB_PASSWORD, database:process.env.DB_DATABASE, timezone:'Z', synchronize:false, migrations:[Repair], migrationsTableName:'smw1653_rehearsal_ledger' });
  await db.initialize();
  const q = db.createQueryRunner();
  try {
    await q.query("SET SESSION time_zone='+00:00'");
    const snapshot = async () => {
      const hashes = {};
      for (const table of ['enrolment_tier_change','enrolment','course','course_program_rate','lesson','private_lesson','lesson_discount']) {
        hashes[table] = digest(await q.query(`SELECT * FROM ${table} ORDER BY id`));
      }
      return hashes;
    };
    const before = await snapshot();
    const plan = await inspectHistoryTimestampRepair(q);
    const repairIds = new Set(plan.repairs.map(r => r.id));
    const untouched = async () => digest((await q.query('SELECT * FROM enrolment_tier_change ORDER BY id')).filter(r => !repairIds.has(r.id)));
    const newerBefore = await untouched();
    assert.ok(plan.repairs.length > 0, 'Fixture must contain old-write candidates');
    const migration = new Repair();
    await db.runMigrations({ transaction:'all' });
    const after = await snapshot();
    for (const table of Object.keys(before).filter(t => t !== 'enrolment_tier_change')) assert.equal(after[table], before[table], `${table} changed`);
    assert.equal(await untouched(), newerBefore);
    assert.equal((await inspectHistoryTimestampRepair(q)).repairs.length, 0);
    await migration.up(q);
    assert.deepEqual(await snapshot(), after, 'Second up must be a no-op');
    const testId = plan.repairs[0].id;
    const [saved] = await q.query('SELECT reason FROM enrolment_tier_change WHERE id=?', [testId]);
    await q.query('UPDATE enrolment_tier_change SET reason=? WHERE id=?', ['SMW-1653 rollback drift test', testId]);
    await assert.rejects(migration.down(q), /rollback refused/);
    await q.query('UPDATE enrolment_tier_change SET reason=? WHERE id=?', [saved.reason, testId]);
    await db.undoLastMigration({ transaction:'all' });
    assert.deepEqual(await snapshot(), before, 'Rollback must restore exact data');
    // Reapply and leave ONLY the disposable schema repaired for browser checks.
    await db.runMigrations({ transaction:'all' });
    assert.deepEqual(await snapshot(), after);
    console.log(JSON.stringify({ passed:true, repaired:plan.repairs.length, unchanged:plan.unchanged, ambiguous:plan.ambiguous, checks:['default all-transaction migration runner','apply','rerun','rollback drift refusal','exact rollback','reapply','financial-table hashes unchanged','newer-history hash unchanged'] }));
  } finally { await q.release(); await db.destroy(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
