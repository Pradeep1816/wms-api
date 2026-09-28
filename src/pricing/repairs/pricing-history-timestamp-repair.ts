import { createHash } from 'node:crypto';
import { QueryRunner } from 'typeorm';

const TOLERANCE_MS = 5000;
export const COLUMNS = `id,enrolmentId,previousTier,newTier,wasDefaulted,
  CAST(effectiveFrom AS CHAR) effectiveFrom,reason,changedByUserId,
  CAST(changedOn AS CHAR) changedOn,CAST(createdOn AS CHAR) createdOn`;

export interface HistoryTimestampRow {
  id: number;
  changedOn: string;
  createdOn: string | null;
  [key: string]: unknown;
}

const utc = (value: string) => Date.parse(value.replace(' ', 'T') + 'Z');
export const hash = (row: HistoryTimestampRow) =>
  createHash('sha256').update(JSON.stringify(row)).digest('hex');

/** Input timestamps MUST have been read with MySQL session time_zone = +00:00. */
export function planHistoryTimestampRepair(rows: HistoryTimestampRow[]) {
  const clock = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const repairs: {
    id: number;
    before: string;
    after: string;
    fingerprint: string;
  }[] = [];
  const ambiguous: number[] = [];
  let unchanged = 0;
  for (const row of rows) {
    const changed = utc(row.changedOn);
    const created = row.createdOn ? utc(row.createdOn) : NaN;
    if (!Number.isFinite(changed) || !Number.isFinite(created)) {
      ambiguous.push(row.id);
      continue;
    }
    if (Math.abs(changed - created) <= TOLERANCE_MS) {
      unchanged++;
      continue;
    }
    // The old writer sent a UTC clock string which MySQL interpreted as Eastern.
    // Recover that original clock string, then interpret it as the intended UTC
    // instant. This uses the offset on that date, not a fixed four-hour shift.
    const p = Object.fromEntries(
      clock
        .formatToParts(new Date(changed))
        .map((part) => [part.type, part.value]),
    );
    const corrected = `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
    const delta = utc(corrected) - created;
    if (Math.abs(delta) <= TOLERANCE_MS) {
      repairs.push({
        id: row.id,
        before: row.changedOn,
        after: corrected,
        fingerprint: hash(row),
      });
    } else {
      ambiguous.push(row.id);
    }
  }
  return { repairs, unchanged, ambiguous };
}

export async function inUtc<T>(
  runner: QueryRunner,
  action: () => Promise<T>,
): Promise<T> {
  const [session] = (await runner.query(
    'SELECT @@session.time_zone AS zone',
  )) as { zone: string }[];
  await runner.query("SET SESSION time_zone = '+00:00'");
  try {
    return await action();
  } finally {
    await runner.query('SET SESSION time_zone = ?', [session.zone]);
  }
}

/** Read-only preflight; safe on dev/prod. No names or reasons in its result. */
export async function inspectHistoryTimestampRepair(runner: QueryRunner) {
  return inUtc(runner, async () =>
    planHistoryTimestampRepair(
      (await runner.query(
        `SELECT ${COLUMNS} FROM enrolment_tier_change ORDER BY id`,
      )) as HistoryTimestampRow[],
    ),
  );
}
