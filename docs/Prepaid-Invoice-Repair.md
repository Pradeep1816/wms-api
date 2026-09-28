# Audited prepaid invoice repair

This is a separate deployment from the application fix for prepaid invoice totals and exploded discount allocation. Deploy the application fix first. Hold this migration until the nine historical corrections have been reviewed against current production data.

Migration: `1789077600000-RepairAuditedPrepaidLessonInvoices.ts`.

## Scope

Refreshed on September 11, 2026. The original eight cases still qualify unchanged; newly affected invoice 1173301 / lesson 5314622 adds $1.09 at Richmond Hill. The updated audit scans all dump records, without carrying over the exclusion for QA customer 15091 that applied only to the prior local copy.

The `smw_sep_11` audit found nine active ordinary invoices whose copied prepaid discounts were omitted from their totals: Woodbridge 2 ($3.09), Richmond Hill 5 ($5.53), Newmarket 2 ($2.18). Total correction: **$10.80**. All other dump locations had zero affected active invoiced lessons. A voided superseded invoice was excluded.

No pre-existing exploded lessons with prepaid-cycle discounts were found in the dump. Consequently this migration has no historical explosion rows to modify. It does not claim coverage of records created or changed after the dump.

| Invoice | Line | Lesson | Customer | Old total | Correct total |
| --- | --- | --- | --- | ---: | ---: |
| 1172723 | 1199768 | 5177994 | 3559 | 36.25 | 35.16 |
| 1172740 | 1199785 | 5396492 | 13650 | 40.00 | 38.00 |
| 1172433 | 1199469 | 5228336 | 14192 | 40.00 | 38.83 |
| 1171295 | 1198326 | 5314621 | 13366 | 36.25 | 35.16 |
| 1173301 | 1200349 | 5314622 | 13366 | 36.25 | 35.16 |
| 1172443 | 1199479 | 5348507 | 14974 | 35.16 | 34.07 |
| 1172856 | 1199901 | 5348508 | 14974 | 36.25 | 35.16 |
| 1172939 | 1199984 | 5428471 | 14744 | 36.25 | 35.16 |
| 1172940 | 1199985 | 5428472 | 14744 | 36.25 | 35.16 |

Six invoices in the dump are partly paid and become settled after correction; three are unpaid. Existing payment rows and invoice/lesson allocations are preserved. No credits or refunds are created. The manual $1.09 discount on lesson 5348507 is retained alongside its prepaid discount.

## Deployment target

The Dev database has independently allocated invoice IDs that collide with this production manifest. For example, Dev invoice 1172723 belongs to customer 9806 at location 1, whereas the reviewed production invoice belongs to customer 3559 at Woodbridge. Applying the manifest to Dev must not change those unrelated records.

`up` explicitly skips when `APP_ENV` is `development`, `dev` or `test`, before opening the journal connection or querying financial data. The Dev deployment workflow sets `APP_ENV=development`. TypeORM records the successful no-op in migration history. The production workflow sets `APP_ENV=production` and still runs every identity, pricing, payment and snapshot guard. Missing or other environment values also retain the guarded path; identity mismatches are never silently skipped.

For an authorized local production-dump rehearsal, explicitly set `APP_ENV=production` in the rehearsal process and verify the dump database name first. `down` remains backup-driven and independent of the current environment, so changing deployment configuration cannot disable recovery of a previously applied repair.

The initial Dev deployment failed before creating a repair backup or changing financial records. Once this follow-up is deployed, rerun the normal deployment; no manual migration-history insertion or record changes are needed.

## Deployment and verification

1. Confirm the application fix is deployed and review a fresh production export for these identities and any newer cases. Pause financial writes for the six affected customers, including scheduled jobs, for the repair window. The migration is deliberately bounded to the reviewed manifest.
2. Take the normal operational database backup. Confirm the migration account can create the backup table and open a second connection. The migration also retains its own scoped before/after journal.
3. Inspect pending migrations with `yarn migration:show`; use the deployment's normal migration runner only after confirming the pending set. Do not run unrelated pending repairs by accident.
4. The migration validates every present target before creating its journal or modifying financial rows. It stops on identity/state changes, incompatible discounts/tax, non-reconciling balances, or payments that would make the corrected invoice overpaid. Missing target invoices on older/fresh databases are skipped; already-correct targets are preserved.
5. After apply, verify each invoice total, balance and status; the invoice-line net total; customer balances; and unchanged payments, allocations, lesson totals and discount rows. Check the journal row and retain it. The migration performs these snapshot postcondition checks itself as well.
6. Resume writes only after verification. If validation fails, diagnose the specific change; do not weaken guards to force a production run.

Customer caches are recalculated from the ledger before applying the correction. The earlier September 9 dump contained stale or zero caches despite owing invoices; the September 11 caches for these six customers now reconcile with the ledger. The ledger-based safeguard is retained rather than assuming caches are always current.

## Backup, recovery and rollback

`migration_prepaid_invoice_repair_backup` retains the original complete rows, expected row changes, SHA-256 checksum and diagnostic state. Snapshots cover invoices, lines, invoice discounts, lesson links, invoice payments, related payments, lessons, private lessons, lesson discounts, lesson payments and customer accounts. Original row timestamps and actor IDs are preserved; the journal records the repair.

The dump's `customer_account` table is MyISAM. An outer transaction rollback cannot undo its writes. The journal therefore uses a separate autocommit connection and is durable before any financial update. This avoids losing the backup if TypeORM rolls back InnoDB invoice changes while MyISAM account changes remain.

Both `up` and `down` verify that every changed row matches either its recorded before or after value, and that all protected rows and computed ledger balances still match. They support a verified partial application. Updates use full-row compare-and-set guards. The `state` field is informational: after an outer rollback it may say `applied` although transactional rows rolled back. Recovery uses the actual snapshots, not that label.

For rollback, keep financial writes paused, inspect migration history, and invoke this migration's `down` through the normal runner only when it is the intended migration to revert. `down` restores the exact original snapshot, including original cached balances, and retains the backup table. If payments, financial balances or protected rows changed afterwards, rollback refuses to overwrite them; review the retained backup instead. No business or backup records are deleted.

## Local verification

On the authorized `smw_sep_11` local dump, using a real TypeORM query runner inside outer transactions:

- Apply: nine corrections matched the complete expected snapshot; payments and lesson data unchanged.
- Repeat apply: exact no-op.
- Down: exact original snapshot restored; backup retained.
- Deliberate outer rollback after apply: durable journal survived the mixed-engine state.
- Recovery apply: expected complete repaired snapshot restored.
- Final down: original financial values restored, with backup retained.

Twelve permanent tests cover manifest totals, preservation, stale caches, already-correct/fresh databases, overpayment refusal, drift, and partial-state recovery. The fresh September 11 dump rehearsal and build passed. The full suite passed with 1,585 tests passed and 11 skipped; refreshed PR CI is tracked on PR #1151. Dev and production repair deployment are not part of this verification.

## Dev deployment regression verification

Read-only verification against smw_may_4 reproduced the original identity refusal. With APP_ENV=development, two calls to up completed with zero financial queries and zero journal connections. Complete financial snapshots were unchanged, and no repair backup was created. The smw_sep_11 read-only production plan still targets nine invoices for $10.80. The production repair arithmetic and backup/rollback implementation are unchanged from the six-step dump rehearsal above.

The build and 21 permanent migration tests passed. The follow-up PR records full-suite and CI results. Live deployment must be rerun after merging the environment fix; this read-only check did not modify Dev migration history or run unrelated pending migrations.
