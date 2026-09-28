# SMW-1653: historical pricing-history timestamp repair

This migration only changes `enrolment_tier_change.changedOn`. No lesson prices,
discounts, invoices, payments, tiers, reasons, or effective dates are changed.
It is separate from the web display PR and from the existing timestamp-write fix
(`4df16046`). Deploy the write fix before running this repair.

## Why and selection

The old writer sent UTC clock values into MySQL timestamps interpreted in Eastern
time. Recent code writes the intended Eastern clock. Neither all old IDs nor all
timestamps should be shifted. The migration reads both timestamps in a UTC session
and reverses the old write using America/Toronto's date-specific timezone rules.
It repairs a row only when the recovered instant is within five seconds either
side of its database-generated `createdOn` (the application clock is sampled before
the insert, and clocks can differ slightly). Correct timestamps within five seconds
of creation are unchanged. Missing creation dates and other mismatches are
reported as ambiguous and left untouched. This assumes `createdOn` retains the
database-generated insertion time; review imported/manually edited history before
approval. It does not claim that every timestamp discrepancy is this defect.

No database name, row IDs, fixed four-hour offset, count, or deployment date is
hard-coded. Dev and production can have different records. Node's timezone data
is used; MySQL named timezone tables are not required.

## Friday dev / Monday production

1. Back up the target database. Confirm the timestamp-write fix is deployed.
2. With that environment's `DB_*` settings, run the read-only preflight:
   `yarn ts-node scripts/pricing-history-timestamp-preflight.ts`.
   For dev select `DB_DATABASE=smw_may_4` using the normal deployment environment.
   The report contains IDs, before/after UTC timestamps, and fingerprints, not names.
3. Review candidates and ambiguous IDs independently for each environment.
   Do not reuse Friday's counts or approval as Monday's production preflight.
4. During a short quiet window, run approved pending migrations with
   `yarn migration:run` (the application's normal deployment command).
   Inspect the pending migration list first: this command runs all pending migrations,
   not only SMW-1653. The repair uses a dedicated connection and manages its own
   data transaction because MySQL DDL commits implicitly. This keeps its DDL out
   of the migration runner's enclosing transaction; no runner/configuration changes
   are required. The history table is locked while candidates are repaired.
5. Rerun the preflight; repaired candidates should be zero. Review any ambiguous
   rows. Check a repaired history and a recent correct history through the UI.

No production access or Friday production deployment is required to merge/review.
Deployment approval remains with the team; this document is not an instruction to
deploy to production on Friday.

## Backup and rollback

The migration keeps `smw1653_pricing_history_timestamp_backup`, with original and
corrected UTC values and whole-row fingerprints. The data changes and backups
commit together. Re-running `up` does not shift repaired rows a second time.

Use the normal migration revert command only when this
is the latest applied migration. `down` restores backed-up timestamps only if each
complete history row still matches its post-repair fingerprint. It refuses and
rolls back if a row was edited/deleted after repair. It empties backup rows only
after successful restoration, retaining the empty table for safe reruns.

## Repeatable checks

- Unit: `yarn test src/migrations/__tests__/1792100000000-RepairPricingHistoryTimestamps.spec.ts`
- Build: `yarn build`
- Disposable local copy only: set `SMW1653_TEST_ALLOW_WRITE=1`, loopback `DB_HOST`,
  the test instance `DB_PORT`, and a `smw_*_test` schema; run
  `node tests/pricing-history-repair.mysql.cjs`.
  This rehearses apply/rerun/rollback/refusal after drift/reapply, and compares
  financial-table hashes. It leaves that disposable copy repaired for UI checks.

## Verification on 25 September 2026

- Pricing + repair unit suite: 536 tests passed; API build and scoped lint passed.
- Approved disposable local subset of `smw_sep_23`: 684 candidates repaired,
  57 correct rows unchanged, zero ambiguous. Normal TypeORM `transaction: all`
  runner, idempotent rerun, rollback refusal after a deliberate row edit, exact
  rollback, and reapply passed. Checked enrolment/course/rate-period/lesson/private
  lesson/discount hashes were unchanged, as were all non-target history rows.
- Real application + Playwright: Woodbridge 15568 history changed from 9:25 PM to
  5:25 PM EDT on September 15; effective date and reason remained unchanged.
  Recent history on West Brampton 35889 remained 8:49 PM EDT on September 22.
- Read-only dev preflight (`smw_may_4`): 326 candidates, 64 unchanged, 2 ambiguous
  IDs 344 and 345 (approximately 40-second differences, not a timezone shift).
  No dev repair has been applied. Counts must be rechecked at deployment.
- No direct production access/verification or production writes were performed.

## CI discovery fix and new-dump/dev rehearsal

The first PR CI caught exported planner/preflight functions in the migration file.
TypeORM's configured glob treats runtime exports as migration constructors; the
explicit-class rehearsal did not exercise that discovery step. Helpers now live
under `src/pricing/repairs`, outside the migration glob, and the migration file
exports only the migration class. The existing deployment-discovery test now also
asserts exactly one SMW-1653 migration. No repair-selection rules changed.

- Full API suite after the fix: 1,807 passed; 27 existing opt-in tests skipped.
  Source migration discovery, API build, and scoped lint passed.
- New `smw_sep_25` copy: 771 history records, 684 repaired, 87 unchanged, no
  ambiguous records. Dev `smw_may_4` copy: 392 history records, 326 repaired,
  64 unchanged, ambiguous 344/345 preserved. Both passed the normal TypeORM
  all-transaction runner, rerun, exact rollback, drift refusal, and reapply.
  All non-target history hashes and bounded 100-row samples from each of six
  enrolment/financial tables were unchanged. Source databases were read-only.
- Deployed web PR 1316 checked with Playwright on dev: enrolment 34022 showed
  `Sept 24 2026, 12:19 PM EDT · applies from Sept 22 2026` in both India and
  Toronto browser timezones (including German locale); empty history also worked.
- The API repair is NOT deployed to dev. Existing older history retains its old
  clock values until that separate migration is deployed.
