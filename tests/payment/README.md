# Payment Tests

## Receive Payment Parity Suite

File: [`receive-payment-parity.spec.ts`](./receive-payment-parity.spec.ts)

This suite documents and verifies the legacy-parity behavior for the receive-payment save flow.
It is a mock-based service suite, not a real database integration test.

### What It Covers

- request validation rules
- negative payment validation rules
- date parsing and create-date guards
- canceled lesson rejection
- amount and distribution mismatch checks
- work-item normalization and not-found guards
- cash allocation to:
  - invoice targets
  - private lesson targets
  - group lesson targets
- invoice-credit allocation to:
  - invoices
  - private lessons
  - group lessons
- existing payment-credit allocation to:
  - invoices
  - private lessons
  - group lessons
- legacy credit eligibility threshold for payment credits
- payment-credit invoice creation
- negative payment flow for:
  - invoice credits
  - payment credits
- receive-payment orchestration order
- post-processing and balance recalculation calls
- audit trail writes for:
  - payment creates and updates
  - invoice payment creates
  - lesson payment creates
  - invoice and invoice line item creates for payment-credit transfers
  - group lesson balance updates

### Why The Audit Trail Exists

- It records an internal history of receive-payment changes for finance and support review.
- It helps trace which user applied a payment, what was touched, and when the change happened.
- It writes receive-payment history into `audit_trail_entry` instead of the newer generic log tables.
- It does not replace the customer-facing receipt, print, or email flow.

### What It Does Not Cover

- live SQL writes against a real database
- transaction commit and rollback behavior in a staging DB
- real HTTP controller and guard execution
- real customer_account persistence in a full integration environment
- production data edge cases that depend on migrated records

### Legacy Parity Rules Reflected Here

- payment credits are allowed in negative saves
- invoice credits and payment credits can be used together when the flow allows it
- payment credit sources must have balance above 0.09 to be eligible
- private lesson and group lesson balances are treated as due when they are positive
- customer account balance is recalculated from lessons due, invoice owing, and total credits
- receive-payment saves audit rows for the same models that had `AuditTrailBehavior` in the old system

### How To Run

```bash
yarn test -- tests/payment/receive-payment-parity.spec.ts
```

### Notes

- This suite is intended to guard the receive-payment business rules during migration from legacy to v2.
- If you need full end-to-end confidence, run the receive-payment API against a staging database with real-like payloads.
