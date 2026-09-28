# A6 course 15895 metadata repair

Migration: `RestoreCourse15895PricingMetadata1788955200000`.

Deploy the A6 application fix first. Run this migration with course/pricing edits and lesson-generating jobs paused. The legacy `course_program_rate` table is MyISAM: the migration has guarded recovery, but a surrounding SQL transaction cannot make its writes atomic. Keep edits paused until verification finishes.

## Exact scope

- Richmond Hill, course **15895**, enrolment **16085**, student **14389**, customer **9404**, Drums Contemporary.
- Restore course start to **2022-01-24 16:00:00**, supported by the June 9 migration backup and earliest valid lesson.
- Preserve course end **2028-01-22 11:00:00**. Later draft lessons do not authorize extending the course.
- Insert the missing periods: **$65/hour, 2022-01-24 through 2026-08-31**, then **$72.50/hour, 2026-09-01 through 2028-01-22**, both inclusive and without a full-discount flag.
- Preserve every existing lesson, lesson total/balance, discount, payment/allocation, invoice, customer account, enrolment and tier-history row. Financial and related-course snapshots must match after apply and revert.
- Do not repair the historical zero-date lesson itself or reprice the 64 client-review lessons.

Changed identity, dates, pricing basis, latest tier decision, published price, supporting date evidence, conflicting/duplicate periods or financial changes during preparation cause a refusal. An installation without course 15895 is a no-op. Older dumps with this exact course/enrolment identity, no tier selection and no tier-change history are also left unchanged: this repair must not invent a pricing decision. An unrelated record with the same ID is refused, not modified. Exact already-repaired data is a no-op; exact partial period insertion can be resumed.

## Backup and rollback

`migration_course_15895_metadata_backup` retains one row keyed by migration name:

- `snapshot`: original course/rate rows and financial/related-record snapshots;
- `afterSnapshot`: verified repaired state, including the exact IDs of inserted rate rows;
- `financialHash`: original financial/related-record fingerprint;
- `createdAt`: backup creation time.

The backup is written and verified before repair. Neither `up()` nor `down()` drops the table or overwrites the first original snapshot. A verified after snapshot is retained for rollback. If execution stops after the repair but before the after snapshot, repeating `up()` validates the state and completes that snapshot.

`down()` restores the saved start date and removes only the period IDs introduced by this migration. Original rate rows remain untouched. It refuses if finances, course metadata or rate rows have changed since repair. It preserves the backup after rollback and restores the connection's SQL mode even if restoring the old zero date requires temporarily permitting zero dates. Rollback restores the previously broken metadata; it is a recovery operation, not a pricing correction.

For normal TypeORM operations, explicitly verify the target database and pending migration list before using the existing `migration:run` command. `migration:revert` reverts the latest migration only; do not use it to target this repair if later migrations have run.

## Validation and release gate

- Safeguard unit tests: `yarn test src/migrations/__tests__/1788955200000-RestoreCourse15895PricingMetadata.spec.ts`.
- Production build and full API suite must pass.
- Run apply, repeat apply, rollback, repeat rollback, reapply and refusal-after-financial-change checks against an isolated copy before release.
- Inspect both rate rows and the course dates; verify financial fingerprints and retained backup snapshots.
- GitHub CI must pass for the final PR revision.
- Production is pending A6 deployment confirmation. Client-approved repricing and a fresh production eligibility check are separate work.

The 64 original lessons were rechecked read-only against `smw_sep_9` on 9 September 2026: 64 still qualified, proposed difference $240. This is dump evidence and must not be treated as current production approval or eligibility.
