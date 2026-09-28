# POS low-stock email alerts (SMW-991)

Apply `1791700000000-AddLowStockAlertOutbox` before starting this API version.
It creates an empty outbox and does not rewrite inventory or email existing low
items at deployment. Configure each school's recipient in `location.email`;
existing `MAIL_*` SMTP settings supply delivery. No new email environment variable
is required. The production worker uses the existing POS rollout helper
(Training and Burlington only); development permits all locations.

An alert is created atomically with a stock change when tracked stock enters
`stockQuantity < lowStockQuantity`. This includes first enabling/configuring
tracking below the threshold and manual quantity/threshold edits. Continuing
below does not create another alert. Restocking to the threshold or above,
disabling tracking, or removing the threshold exits that state; a later entry
can alert again. POS checkout currently deducts stock; the shared
`queueLowStockAlert` function is ready for future invoice stock movements.

Call that function only inside the stock transaction, with the stock row locked
and an immutable before image. Restores need no separate flag. The worker reads
only committed events and suppresses delivery if stock has recovered, tracking
is disabled, the item/location is deleted or the location is outside rollout.

The `low-stock-email` job runs every minute and uses the existing MySQL advisory
lock service to serialize workers, exactly like the existing email and balance
crons. Both production API instances acquire the same `cron:low-stock-email`
lock using `GET_LOCK(..., 0)` on a dedicated connection held for the whole run;
the losing instance skips processing. Manual runs use the same lock. No school
email is sent inside a sale transaction. An email contains school, item description/code/UPC, stock at the
crossing, current stock and threshold. User-entered content is HTML escaped.

## Delivery operations

Administrator-only endpoints:

- `GET /admin/v2/cron/low-stock-email`: job metadata and latest 100 events,
  including recipient, attempts, status and actionable error.
- `POST /admin/v2/cron/low-stock-email/run`: process due events using the same
  distributed lock. This does not bypass retry timing or resend sent/review/failed rows.

Missing/invalid school addresses and definite SMTP rejections permit **five
attempts total** (initial attempt plus four retries after 1, 2, 4 and 8 minutes).
Missing-address checks count toward this limit even though SMTP is not called.
After the fifth failure the event is marked `failed` and automatic/manual cron
runs leave it alone. Old pending events already at/above the cap also stop
without sending. Job metadata exposes `maxDeliveryAttempts: 5`. Fix the school's
email or SMTP configuration before remaining retries; the next due attempt uses
the corrected school address. Errors
are also logged with event/location IDs. This release exposes operator status
through the API/logs, not a new staff-facing notification screen.

`review` means the SMTP outcome is uncertain (such as a timeout during DATA),
or a prior worker stopped with an event marked `sending`. Do not automatically
retry: inspect provider delivery logs using the stable Message-ID
`smw-low-stock-{id}-{createdAt}@notifications.studiomanagerweb.com` and verify the
recipient. An operator can mark a confirmed delivered event sent, or requeue a
confirmed undelivered event after investigation. Preserve the event ID/history;
never assume a timeout proves nondelivery. SMTP cannot provide an atomic commit
with MySQL. A database failure after SMTP acceptance deliberately leaves the
event for review, preventing an automatic duplicate.

The outbox enqueue is part of financial atomicity: an outbox DB write failure
rolls back the stock/sale transaction. SMTP failure happens later and cannot
undo a completed sale. This distinction is intentional.

## Verification

`yarn test src/item src/pos src/cron` covers transitions, stock validation,
reversals, role restrictions, rollout, retry/backoff and uncertain delivery.

After building and applying the migration, run the explicit rollback-only DB
test against an approved development database (never production):

```powershell
$env:SMW_LOW_STOCK_TEST_DATABASE='smw_sep_23'
node --test tests/item/low-stock-alert.integration.cjs
```

The database name must match the configured connection. It tests real repository
stock edits, POS stock deductions/restores, savepoint rollback, uncommitted event
isolation and two-school delivery into an in-memory sink. It also runs two
independent workers with separate real MySQL lock connections: one held mid-send,
the other skipped, and no resend after lock release. All fixtures roll back.
Browser verification and environment-specific status belong in the vault POS QA
checklist; local email capture does not establish production SMTP delivery.
