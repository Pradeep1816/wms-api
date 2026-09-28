# Student Enrolment Unit Tests

This note is for the unit tests I added for private enrolment creation in:

- `src/student/services/student-enrolment.service.ts`

Current total in this module: 20 tests

## What I covered

I covered the core create-enrolment behavior that can break easily during migration:

- student validation (`student not found` path)
- payment frequency validation (`invalid payment frequency` path)
- invalid payment cycle start date handling
- invalid day handling
- invalid start date/time parsing handling
- discount mapping parity
  - multiple enrolment discount saved as dollar + type `2`
  - payment frequency discount saved as percentage + type `1`
- lesson creation defaults
  - status is `SCHEDULED`
  - due date is normalized to midnight
- teacher-rate fallback
  - if teacher rate is missing, fallback is `0` (legacy behavior)
- weekly date generation rules
  - regular weekly creation
  - skip 5th weekday professional-development slot
  - skip holiday date and move to next week
- no-discount path
  - discount rows are not created when both values are zero
- enrolment payment frequency row payload
  - `paymentCycleStartDate` parsing and persistence payload
- final course end-date update
  - end date is updated to the last generated lesson date
- online mode propagation
  - `isOnline` is carried across course, enrolment, and lesson payloads
- response reload guard
  - throws when created enrolment cannot be reloaded for DTO transform
- current time-input contract
  - `startTime` is expected as `HH:mm`; `HH:mm:ss` is rejected
- time normalization
  - `HH:mm` inputs are normalized to `HH:mm:ss` for schedule payload
- lesson pricing payload
  - lesson `total` is derived as `discountedRatePerMonth / 4`
- lesson original-date backfill
  - service updates `originalDate` after lesson insert
- zero-lesson edge case
  - when `lessonsCount = 0`, no lesson rows are created
- undefined-discount edge case
  - discount rows are not created when values are missing

## Why these tests matter

These are the exact points where legacy parity can drift quietly:

- wrong discount types in DB
- wrong teacher-rate fallback
- wrong lesson status or due-date defaults
- wrong date chain when 5th-weekday/holiday rules apply

If these pass, we have a safer base before adding broader flow tests.

## What is not covered yet

- full branch matrix across all payment frequencies
- long-chain generation with mixed holiday + PD combinations
- controller/e2e coverage
- persistence-level assertions against a real DB

## Command I run for this module

```bash
yarn test src/student/services/student-enrolment.service.spec.ts
```
