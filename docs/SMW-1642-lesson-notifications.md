# SMW-1642: missing automatic lesson notifications

Enabled customers can miss reminders because the sender inner-joins a pending
`private_lesson_email_status` or `group_lesson_email_status` row. A missing row
excludes the lesson before SMTP is called. Saving customer preferences does not
create lesson statuses or send an immediate message.

## Code changes

The following paths now ensure missing private notification records exist:

- Scheduled enrolment auto-renewal.
- Renewal triggered by a payment-frequency change that extends the course.
- Lesson confirmation, including permanent schedule changes with pre-existing
  `private_lesson` financial records.
- Enrolment teacher-change confirmation.
- Bulk reschedule of selected private lessons.
- Private teacher substitution confirmation.

Group substitution now checks `course.program.type`, rather than the regular/extra
`lesson.type`, and initializes statuses separately for enrolled students.

Group reminder delivery selects only students with a pending status for the exact
lesson and notification type, scoped to the current customer and an active,
confirmed enrolment. This prevents partial retries or another customer's pending
records from resending a reminder that already succeeded.

The shared helper inserts missing combinations for the four supported notification
types. It never updates existing statuses or copies sent flags from old lesson IDs.
Callers use their existing creation/confirmation transaction repositories. New
lesson IDs belong to those transactions; confirmation updates the lesson before
ensuring statuses. Repeat calls preserve pending and sent records.

Normal new-enrolment confirmation, manual schedule extension, and individual Edit
Schedule already create notification records. The sender's customer preferences,
regular/makeup/first-lesson conditions, and next-24-hours window are unchanged.

## Migration for existing future lessons

Migration `1788800000000-BackfillFutureLessonNotificationStatuses` inserts missing
records for existing eligible lessons strictly beyond the sender's next-24-hours
window. The cutoff is computed once when the migration starts, using Eastern
wall-clock time plus one calendar day, exactly like the sender (including DST).
Lessons at the cutoff or before it are excluded, including all past lessons.

It includes scheduled/rescheduled, confirmed, non-deleted regular lessons in
confirmed non-deleted regular courses/enrolments, for non-deleted students whose
customers have at least one supported notification option enabled. Group students
also need an enrolment ending on or after the cutoff date. All non-deleted
locations are covered, including Training Location, matching the sender's scope.

Only missing status combinations for types 1?4 are inserted. Existing pending and
sent records are never updated. The sender still checks each customer's enabled
options and the lesson-specific conditions before sending. The migration neither
starts the email job nor calls SMTP. Records for later lessons enter the normal
reminder window as their scheduled dates approach; normally coincident reminders
can still be sent together.

The migration requires TypeORM's migration transaction, locks lessons in ordered
batches, and reads current status rows under locks to avoid duplicating records
created by a concurrent confirmation. A failure rolls back its inserts. Repeating
it does not reset or duplicate statuses. Its `down` deliberately retains the
records, because they may subsequently contain sent history.

The existing deployment command runs migrations before starting the application.
There is no separate repair script or scheduled backfill job. The first 24 hours'
missing records remain unrepaired to avoid an immediate catch-up burst.

Read-only preview on the production dump on 2026-09-08, with exclusive cutoff
2026-09-09 02:18:30 Eastern, found 133,048 missing records across active locations
(including Training Location), of which 26,664 belong to 78 North Brampton
customers. The three reported customer IDs account for 1,152 records: 13135 has
412, 6721 has 76, and 12559 has 664. Live counts will depend on deployment time.
Only the migration's read-only `preview()` was executed against the dump; `up()`
was tested solely in isolated MySQL temporary tables. No dump or live data was
changed during implementation.

## Verification

```shell
yarn test tests/lesson/future-notification-migration.spec.ts src/lesson/helpers/ensure-lesson-email-statuses.spec.ts tests/lesson/notification-status-flows.spec.ts tests/enrolment-behavior/service/private-reschedule-confirmation.service.spec.ts
yarn build
```

The MySQL regression uses connection-local temporary tables in a dedicated test
database, without schema synchronization, schema drops, or application startup.
Set `SMW_NOTIFICATION_TEST_DSN` to a restricted test user's MySQL DSN, `NODE_ENV=test`,
and `TEST_DB_ALLOW_SYNC=1` (required by the shared controlled-database guard even
though this test does not synchronize), then run:

```shell
yarn test tests/lesson/notification-status-mysql.integration.spec.ts
```

These tests verify actual persistence, strict 24-hour boundary exclusions,
pending/sent-flag preservation, repeat execution, and transaction rollback after a
partial insertion failure. Without the dedicated DSN, the MySQL suite is explicitly skipped.

## Running application verification (2026-09-08)

The Nest API and Next web app were started locally against a dedicated MySQL 8
database with the dump's schema, reference data, and synthetic users/students.
Chrome exercised the actual UI using an isolated browser profile. SMTP went to a
loopback-only capture server with no forwarding. No customer credentials were
copied, no dump data was modified, and no emails were delivered externally.

| Flow exercised | Result |
| --- | --- |
| Office login | Synthetic administrator signed in through the browser form. |
| Permanent schedule change and confirmation | 12 replacement lessons, 48 notification records. Before confirmation, all 12 already had financial records and none had notification records, reproducing the original failure condition. |
| Enrolment teacher change and confirmation | 12 replacement lessons, 48 notification records. |
| Bulk reschedule of two selected private lessons | Both originals cancelled; both replacements had four notification records. |
| Private teacher substitution | Replacement lesson had four notification records. |
| Group teacher substitution | Replacement lesson had four records for each of two enrolled students. |
| Payment-frequency change extending the course | UI change from monthly to every five months generated 96 additional lessons and 384 notification records. |
| Auto-renewal cron through its authenticated HTTP trigger | One eligible enrolment renewed; 98 additional lessons and 392 notification records; no processing failures. |
| Customer notification preferences | Disabling all four options through the UI prevented sending for ten prepared due lessons; enabling them allowed processing. |
| Migration through TypeORM's transactional runner | Later missing records inserted; past, next-24-hour, and cancelled cases excluded; existing sent flag preserved; rerun applied no migration; no immediate email. |
| SMTP delivery and retry | A local SMTP authentication failure left tested statuses pending. After correcting the catcher configuration, ten lesson scenarios covering the changed paths produced 12 captured messages across all four notification types, with zero send or processing failures. A subsequent job run sent zero additional messages. |

For delivery verification, selected synthetic lessons were moved into the normal
sender window after their notification records were checked. This included a
lesson repaired by the migration, demonstrating that it sends when it becomes
due. The counts above describe these fixtures, not production email volumes.

Local setup required the repository's Turbopack development command; the initial
Webpack development launch produced an invalid JavaScript chunk. Isolated MySQL
also needed a SQL mode compatible with the legacy schema's zero-date defaults.
Neither setup adjustment changed application source or production configuration.

### Group retry defect reproduced and fixed

An additional mixed-status test initially failed: for two students sharing a
customer and group lesson, with one student's regular reminder already sent and
the other's pending, the real job sent two emails while updating only one status.
The capture confirmed the already-sent student was included again.

The existing sender issue was separate from notification-record creation:
`getGroupLessonsForNotification()` selects a lesson with a pending group status,
then the service sends to every eligible student returned by
`getEligibleGroupStudentsForCourse()`, without checking that individual student's
pending status for this lesson and notification type. The sender now calls
`getPendingGroupStudentsForLesson()` to join each student to that exact pending
combination and exclude deleted enrolments.

After rebuilding and restarting the API, the same mixed-status case sent exactly
one email to the pending student and updated one status. A second run sent none.
Adding a third student belonging to another, opted-out customer with pending
records also caused no repeat emails to the already-notified customer.

Permanent MySQL regression coverage in
`tests/lesson/group-email-retry-mysql.integration.spec.ts` exercises notification
types 1, 2, and 4. It verifies customer, lesson, type and sent-state isolation;
deleted/expired/unconfirmed enrolment exclusions; duplicate-enrolment deduplication;
and an SMTP failure followed by a successful retry and an empty repeat run.
These tests use connection-local temporary tables with the same guarded DSN as
the existing MySQL notification tests. The overdue sender already filters its
recipients by exact pending student status and retains its existing regression test.

Final verification: 33 focused notification tests passed with none skipped;
the full suite passed 1,273 tests with five unrelated database-dependent tests
skipped. The Nest build passed. The new MySQL test file passes ESLint; the changed
existing files introduce no additional non-formatting lint findings compared with
their baseline (their pre-existing formatting/lint debt was not reformatted).

Real inbox delivery, spam filtering, provider suppression lists, and deployment
against production remain unverified. Local SMTP capture verifies application
submission and status transitions, not external mailbox receipt.


## September 11 opt-in follow-up

An older account can still have missing lesson statuses when it enables reminders
only after the first repair migration. Preference saves previously changed only
the opt-in flags. They did not create missing rows for existing lessons.

Saving any supported enabled option now atomically saves preferences and repairs
eligible missing statuses for that customer across their locations (preferences
are customer-wide). Re-saving enabled preferences is safe and also repairs gaps.
Disabling all supported options creates no lesson statuses. If repair fails, the
preference update and inserted statuses roll back together.

A separate migration, RepairOptedInFutureLessonNotifications1789128000000, repairs
eligible accounts already opted in. The old migration and its ledger entry remain
unchanged. Both paths use the new FutureLessonNotificationRepair helper; the old
migration's implementation is deliberately retained as historical migration code.
No standalone repair script is shipped.

Both paths capture Eastern wall time plus one calendar day and insert only missing
combinations for eligible lessons strictly beyond that cutoff. They preserve
existing pending/sent rows and make no SMTP calls. Past lessons, lessons exactly
at the cutoff and lessons inside the next-day window are intentionally excluded.
An opt-in does not therefore guarantee a reminder for a lesson due tomorrow if
its record is already missing. Existing pending due records can send normally,
and repaired later lessons can send when they enter the normal window; this is
not a promise of zero legitimate mail after deployment.

The migration keeps rows on down because they may contain sent history. Do not
reset flags or delete the original migration ledger to force replay. A customer's
preference-save repair is scoped by customer ID; a group lesson's other customers
are not repaired by that request. Normal eligibility still controls sending.

Verification for this follow-up includes the original and new migrations against
real MySQL temporary tables, opt-in after the old migration, repeat saves, customer
isolation, exclusions, sent preservation and rollback after group insertion fails.
A running local Nest customer endpoint with real service/repository and synthetic
MySQL also passed enabled/repeated/disabled requests and invalid-body rejection;
its authentication and location validation were test stubs. The actual TypeORM
runner applied the new migration once and applied nothing on the second run.
The Nest build passed. Production and the supplied dump were not modified.
