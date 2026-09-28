/**
 * Canonical parsing and UTC-boundary helpers for permanent schedule change
 * dates. PSC code uses these helpers instead of changing shared date utilities.
 */
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import utc from 'dayjs/plugin/utc';

dayjs.extend(customParseFormat);
dayjs.extend(utc);

const PERMANENT_SCHEDULE_DATE_FORMATS = [
  'D-M-YYYY',
  'DD-MM-YYYY',
  'MMM D, YYYY',
  'MMM DD, YYYY',
  'YYYY-MM-DD',
] as const;

const PERMANENT_SCHEDULE_MONTH_FORMATS = ['YYYY-MM', 'YYYY-M'] as const;

const PERMANENT_SCHEDULE_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Parse a legacy PSC date value as a date-only UTC value. */
export function parsePermanentScheduleDate(dateString: string): Date {
  const normalized = String(dateString).trim();

  for (const format of PERMANENT_SCHEDULE_DATE_FORMATS) {
    const parsed = dayjs.utc(normalized, format, true);
    if (parsed.isValid()) {
      return parsed.startOf('day').toDate();
    }
  }

  throw new Error(`Invalid date format: ${dateString}`);
}

/** Parse a PSC month key as the first day of that month in UTC. */
export function parsePermanentScheduleMonth(monthKey: string): Date {
  const normalized = String(monthKey).trim();

  for (const format of PERMANENT_SCHEDULE_MONTH_FORMATS) {
    const parsed = dayjs.utc(normalized, format, true);
    if (parsed.isValid()) {
      return parsed.startOf('month').toDate();
    }
  }

  throw new Error(`Invalid month key: ${monthKey}`);
}

/** Return the first UTC instant of the month containing the supplied date. */
export function startOfPermanentScheduleMonth(date: Date): Date {
  return dayjs.utc(date).startOf('month').toDate();
}

/** Return the final UTC instant of the day containing the supplied date. */
export function endOfPermanentScheduleDay(date: Date): Date {
  return dayjs.utc(date).endOf('day').toDate();
}

/** Format a UTC date using the legacy PSC API representation. */
export function formatPermanentScheduleDate(date: Date): string {
  return `${PERMANENT_SCHEDULE_MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}
