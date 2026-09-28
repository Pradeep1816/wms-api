# Cron Module Guide

This module is the single place for background cron jobs in the NestJS system.

Current goals:
- keep cron logic separate from normal API/business modules
- allow manual triggering through protected API endpoints
- keep each cron isolated so new jobs do not affect existing functionality

## Folder Structure

Use this structure for every new cron:

```text
src/cron/
  cron.module.ts
  README.md
  controllers/
    cron.controller.ts
  repositories/
    <job-name>-cron.repository.ts
  services/
    <job-name>-cron.service.ts
```

Rules:
- `controller` is only for manual trigger endpoints and job listing
- `service` contains orchestration, cron decorator, logging, and execution flow
- `repository` contains DB access only
- reuse entities from other modules instead of duplicating them
- prefer TypeORM query builder/repositories, not raw SQL

## Current Pattern

For each cron job:
1. Add one dedicated service in `src/cron/services`
2. Add one dedicated repository in `src/cron/repositories` if DB access is needed
3. Register both in `CronModule`
4. Add a manual trigger endpoint in `CronController`
5. Protect the manual endpoint with existing auth guards
6. Hardcode the cron expression and timezone inside the cron service unless there is a clear need for config
7. Keep the job behavior aligned with legacy rules when migrating old cron jobs

## Auth Pattern For Manual Trigger

Use the existing app auth pattern:

```ts
@UseGuards(AuthGuard, RolesGuard)
@Roles(RolesEnum.ADMINISTRATOR)
```

Manual trigger endpoints must be admin-only unless there is a strong reason otherwise.

## Cron Service Checklist

Each cron service should contain:
- a clear `jobName`
- one `@Cron(...)` method for scheduler execution
- one public method for manual execution
- start/end logging
- return a small result object with counts, status, and duration where useful
- an early production guard when the cron is intentionally disabled in prod

Recommended shape:

```ts
@Cron('0 0 2 * * *', { timeZone: 'America/New_York' })
async runScheduled() {
  return this.run('scheduler', null);
}

async runManually(userId: number) {
  return this.run('manual', userId);
}

private async run(
  triggeredBy: 'scheduler' | 'manual',
  triggeredByUserId: number | null,
): Promise<JobResult | null> {
  if (isProd()) {
    return null;
  }

  // actual cron logic
}
```

## Production Guard Rule

Current project rule:
- every cron `run(...)` method should start with `if (isProd()) { return null; }`
- this keeps all cron jobs disabled in production by default
- when enabling a cron in production, remove the `isProd()` check only from that specific cron service
- do not remove the guard globally from all cron services at once unless explicitly required

## Repository Rules

Repository files should:
- use TypeORM repositories or query builders
- avoid raw SQL unless absolutely necessary
- avoid mixing unrelated business logic
- expose small focused methods like:
  - `getTargetCounts()`
  - `updateActiveCustomers()`
  - `updateInactiveCustomers()`

## Timezone Rule

For migrated legacy daily jobs, use:

```ts
timeZone: 'America/New_York'
```

Do not rely on server timezone.

## Steps To Add A New Cron

1. Understand the exact legacy cron behavior first.
2. Identify what must be preserved:
   - schedule
   - timezone
   - records read
   - records updated
   - side effects
3. Create a new cron service in `src/cron/services`.
4. Create a new cron repository in `src/cron/repositories` if needed.
5. Register the new classes in `src/cron/cron.module.ts`.
6. Add a manual trigger route in `src/cron/controllers/cron.controller.ts`.
7. Protect the route with `AuthGuard` and `RolesGuard`.
8. Reuse existing entities/repositories from other modules where possible.
9. Build the app and verify there are no regressions.
10. Only then enable or use the cron.

## Things To Avoid

- putting cron logic into normal customer/student/invoice controllers
- duplicating entity definitions
- changing existing API behavior while adding a cron
- using raw SQL when TypeORM can express the same query
- adding one generic “run everything” endpoint

## Before Merging A New Cron

Minimum verification:
- `npm run build`
- confirm manual trigger endpoint is protected
- confirm timezone is correct
- confirm the cron updates only the intended records
- confirm unrelated modules/controllers are untouched

## Notes

- The cron module is for background jobs, not the existing lesson/class `schedule` module.
- Keep each cron implementation small and explicit.
- If a cron needs special safeguards later, add them inside that job service instead of complicating all cron jobs globally.
