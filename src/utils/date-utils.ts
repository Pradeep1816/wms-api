// ✅ Use require instead of import
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const advancedFormat = require('dayjs/plugin/advancedFormat');
import { RoundingUtils } from './rounding.utils';

// ✅ Extend the plugin directly
dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(advancedFormat);

// ✅ Export the utility function
export function calculateNextPaymentDate(paymentDay, nextEntryDay) {
  const nextEntry = dayjs(nextEntryDay);
  const nextEntryDayOfMonth = parseInt(nextEntry.format('D'));

  let nextPaymentBase =
    paymentDay < nextEntryDayOfMonth
      ? nextEntry.add(1, 'month')
      : nextEntry;

  const lastDayOfMonth = nextPaymentBase.endOf('month').date();
  const safeDay = Math.min(paymentDay, lastDayOfMonth);

  const formattedDate = dayjs(
    `${safeDay}-${nextPaymentBase.format('MM')}-${nextPaymentBase.format('YYYY')}`,
    'D-MM-YYYY'
  );

  return formattedDate.format('YYYY-MM-DD');
}

export function formatDateWithTime(date: Date): string {
  const d = dayjs.utc(date);
  return d.format('MMM DD, YYYY [at] hh:mm A');
}



/**
 * Create a Date object that represents local time for database storage
 * 
 * When TypeORM saves a Date to a MySQL timestamp column, it converts to UTC.
 * This function creates a "fake UTC" date - the UTC representation equals
 * the intended local time value, so when saved, it stores the correct value.
 * 
 * Example: If you want to store "2026-01-21 10:00:00" in the database:
 * - createLocalDateTime(2026, 0, 21, 10, 0, 0) returns a Date
 * - When TypeORM saves it, the database will have "2026-01-21 10:00:00"
 * 
 * @param year - Full year (e.g., 2026)
 * @param month - Month (0-11, where 0 = January)
 * @param day - Day of month (1-31)
 * @param hours - Hours (0-23)
 * @param minutes - Minutes (0-59)
 * @param seconds - Seconds (0-59), default 0
 * @returns Date object that stores as local time in database
 */
export function createLocalDateTime(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  seconds: number = 0,
): Date {
  // Create date using UTC methods so the UTC value equals our intended local time
  return new Date(Date.UTC(year, month, day, hours, minutes, seconds));
}

/**
 * Convert a local Date object to a "fake UTC" Date for database storage
 * 
 * Use this when you have a Date object in local timezone and want to
 * store its local time value directly in the database without timezone conversion.
 * 
 * @param localDate - Date object in local timezone
 * @returns Date object that stores as the same time value in database
 */
export function toLocalDateForStorage(localDate: Date): Date {
  return new Date(Date.UTC(
    localDate.getFullYear(),
    localDate.getMonth(),
    localDate.getDate(),
    localDate.getHours(),
    localDate.getMinutes(),
    localDate.getSeconds(),
  ));
}

export function formatSimpleDateTime(date: Date): string {
  const d = dayjs.utc(date);
  return d.format('MMM DD, YYYY h:mm A');
 }

 export function formatDate(date: Date): string {
   // Always use UTC to avoid timezone conversion issues
   // This ensures dates like 2021-09-27T19:00:00.000Z show as Sep 27, 2021
   return dayjs.utc(date).format('MMM DD, YYYY');
 }

/**
 * Format date to raw ISO day string (YYYY-MM-DD) in UTC.
 */
export function formatDateYMD(date: Date): string {
  if (!date) return '';
  return dayjs.utc(date).format('YYYY-MM-DD');
}

// Parse a date string in multiple accepted formats and return a JS Date.
// Accepted inputs include:
// - 'YYYY-MM-DD' (API default)
// - 'MMM D, YYYY' 
// - 'MMM DD, YYYY'
// Falls back to new Date(value) if formats fail.
export function parseFlexibleDate(value?: string): Date | null {
  if (!value) return null;
  const formats = ['YYYY-MM-DD', 'MMM D, YYYY', 'MMM DD, YYYY'];
  for (const fmt of formats) {
    const d = dayjs(value, fmt, true);
    if (d.isValid()) return d.toDate();
  }
  const d = dayjs(value);
  return d.isValid() ? d.toDate() : null;
}

/**
 * Parse PSC date strings as midnight UTC.
 * Supports the legacy-style date formats used by PSC flows.
 */
export function parsePscDateOnly(dateString: string): Date {
  const normalized = String(dateString).trim();
  const formats = [
    'D-M-YYYY',
    'DD-MM-YYYY',
    'MMM D, YYYY',
    'MMM DD, YYYY',
    'YYYY-MM-DD',
  ];

  for (const fmt of formats) {
    const parsed = dayjs.utc(normalized, fmt, true);
    if (parsed.isValid()) {
      return parsed.startOf('day').toDate();
    }
  }

  throw new Error(`Invalid date format: ${dateString}`);
}

/**
 * Parse a PSC month key like YYYY-MM or YYYY-M as the first day of that month in UTC.
 */
export function parseUtcMonthKey(monthKey: string): Date {
  const normalized = String(monthKey).trim();
  const formats = ['YYYY-MM', 'YYYY-M'];

  for (const fmt of formats) {
    const parsed = dayjs.utc(normalized, fmt, true);
    if (parsed.isValid()) {
      return parsed.startOf('month').toDate();
    }
  }

  throw new Error(`Invalid month key: ${monthKey}`);
}

/**
 * Return the start of a month in UTC.
 */
export function startOfUtcMonth(date: Date): Date {
  return dayjs.utc(date).startOf('month').toDate();
}

/**
 * Return the end of a day in UTC.
 */
export function endOfUtcDay(date: Date): Date {
  return dayjs.utc(date).endOf('day').toDate();
}

// Format a Date to legacy string like 'Sep 1, 2025'
export function formatLegacyDate(date: Date): string {
  return dayjs(date).format('MMM D, YYYY');
}

// Format to 'Friday, August 1st, 2025'
function formatLongDate(date: Date): string {
  return dayjs(date).format('dddd, MMMM Do, YYYY');
}

// Format to 'Friday, August 1st, 2025' using Eastern timezone
export function formatLongDateInEastern(date: Date): string {
  return dayjs(date).tz('America/New_York').format('dddd, MMMM Do, YYYY');
}

/**
 * Format date to 'Friday, August 1st, 2025' using UTC
 * formatLongDateUTC(new Date('2025-03-15T02:00:00Z')) // returns 'Saturday, March 15th, 2025'
 */
export function formatLongDateUTC(date: Date): string {
  if (!date) return '';
  return dayjs.utc(date).format('dddd, MMMM Do, YYYY');
}

// Get Eastern date
export function getEasternDateValue(date: Date): number {
  return dayjs(date).tz('America/New_York').startOf('day').valueOf();
}

// Convert legacy date format to ISO date format for database queries
// Legacy format: "Jan 15, 2024" -> ISO format: "2024-01-15"
function convertLegacyDateFormat(dateStr: string): string {
  try {
    // Add EST timezone to ensure consistent parsing
    const date = new Date(dateStr + ' 00:00:00 EST');
    return date.toISOString().split('T')[0];
  } catch (error) {
    // Fallback to current date if parsing fails
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Get weekdays list mapping day numbers to day names
 */
export function getWeekdaysList(): Record<number, string> {
  return {
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday',
    7: 'Sunday',
  };
}

/**
 * Convert a JavaScript Date to the legacy PSC weekday number.
 * Sunday maps to 7 to match the PHP/NestJS PSC schedule rules.
 */
export function getLegacyPscWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Get weekday name from number (1=Monday ... 7=Sunday)
 */
export function getWeekdayName(dayNumber: number): string {
  const weekdaysList = getWeekdaysList();
  return weekdaysList[dayNumber] || 'Unknown';
}

/**
 * Move a source date to the next occurrence of the target weekday and time.
 * If the weekdays already match, only the time is updated.
 * This mirrors the legacy Apply All lesson reschedule behavior.
 */
export function calculateNextWeekdayDateTime(sourceDate: Date, targetDate: Date): Date {
  const nextDate = new Date(sourceDate.getTime());
  const sourceDay = nextDate.getUTCDay();
  const targetDay = targetDate.getUTCDay();

  if (sourceDay !== targetDay) {
    const daysUntilTarget = (targetDay - sourceDay + 7) % 7;
    nextDate.setUTCDate(nextDate.getUTCDate() + daysUntilTarget);
  }

  nextDate.setUTCHours(
    targetDate.getUTCHours(),
    targetDate.getUTCMinutes(),
    targetDate.getUTCSeconds(),
    0,
  );

  return nextDate;
}

/**
 * Format birth date safely using formatDate utility
 */
export function formatBirthDate(birthDate: any): string {
  if (!birthDate) return '';
  
  try {
    let date: Date;
    
    // If it's already a Date object
    if (birthDate instanceof Date) {
      date = birthDate;
    } else if (typeof birthDate === 'string') {
      // If it's a string, try to parse it
      date = new Date(birthDate);
      if (isNaN(date.getTime())) {
        return '';
      }
    } else {
      return '';
    }
    
    return formatDate(date);
  } catch (error) {
    return '';
  }
}


/**
 * Format date and time as "YYYY-MM-DD h:mm a" (e.g., "2024-12-31 2:30 PM")
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) {
    return '';
  }

  const dateObj = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(dateObj.getTime())) {
    return '';
  }

  // Use UTC methods to avoid timezone issues
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  
  let hours = dateObj.getUTCHours();
  const minutes = String(dateObj.getUTCMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const hoursStr = String(hours); // No padding for hours in this format

  return `${year}-${month}-${day} ${hoursStr}:${minutes} ${ampm}`;
}

/**
 * Format a Date as `HH:mm:ss` using UTC components.
 * Used by PSC room resolution to match legacy time-window queries.
 */
export function formatUtcTime(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Parse a date string in multiple supported formats as UTC (no timezone conversion).
 * Supported formats:
 *   - "YYYY-MM-DD h:mm A"     (e.g., "2026-02-25 3:00 PM")
 *   - "MMM DD, YYYY HH:mm"    (e.g., "Dec 22, 2025 14:00")
 *   - "MMM D, YYYY HH:mm"     (e.g., "Dec 8, 2025 09:05")
 *   - "MMM DD, YYYY H:mm"     (e.g., "Dec 05, 2025 1:45")
 *   - "MMM D, YYYY H:mm"      (e.g., "Dec 5, 2025 1:45")
 *   - "YYYY-MM-DD HH:mm:ss"  (e.g., "2025-12-23 10:00:00")
 *   - "YYYY-MM-DD HH:mm"     (e.g., "2025-12-23 10:00")
 *   - "YYYY-MM-DD H:mm"      (e.g., "2025-12-23 1:05")
 *   - "MMM DD, YYYY h:mm A"  (e.g., "Dec 28, 2025 04:00 PM")
 *   - "MMM D, YYYY h:mm A"   (e.g., "Dec 8, 2025 04:00 PM")
 *
 * @param dateString - Date string in any of the supported formats
 * @returns Date object that represents the exact time provided (treated as UTC)
 * @throws Error if the date string does not match any supported format
 */
export function parseDateAsUTC(dateString: string): Date {
  const formats = [
    'YYYY-MM-DD h:mm A',
    'YYYY-MM-DD hh:mm A',
    'YYYY-MM-DD h:mm a',
    'YYYY-MM-DD hh:mm a',
    'MMM DD, YYYY HH:mm',
    'MMM D, YYYY HH:mm',
    'MMM DD, YYYY H:mm',
    'MMM D, YYYY H:mm',
    'YYYY-MM-DD HH:mm:ss',
    'YYYY-MM-DD HH:mm',
    'YYYY-MM-DD H:mm',
    'MMM DD, YYYY h:mm A',
    'MMM D, YYYY h:mm A',
    'MMM DD, YYYY hh:mm A',
    'MMM D, YYYY hh:mm A',
    'MMM DD, YYYY h:mm a',
    'MMM D, YYYY h:mm a',
    'MMM DD, YYYY hh:mm a',
    'MMM D, YYYY hh:mm a',
  ];

  for (const fmt of formats) {
    const parsed = dayjs.utc(dateString, fmt, true);
    if (parsed.isValid()) {
      return parsed.toDate();
    }
  }

  const iso = dayjs.utc(dateString);
  if (iso.isValid()) {
    return iso.toDate();
  }

  throw new Error(`Invalid date format: ${dateString}`);
}

/**
 * Parse a date string in "YYYY-MM-DD HH:mm:ss" format
 * Treats the input as the exact time to store (naive datetime)
 * Since database stores in UTC, we parse the input as UTC to store it exactly as provided
 * 
 * @param dateString - Date string in format "YYYY-MM-DD HH:mm:ss"
 * @returns Date object that represents the exact time provided (treated as UTC)
 * 
 * Example: parseLocalDateTime("2025-12-23 10:00:00") 
 *          will create a Date for 10:00 AM UTC, which stores as "2025-12-23 10:00:00" in DB
 *          When displayed, it will show as 10:00 AM in the viewer's timezone
 */
export function parseLocalDateTime(dateString: string): Date {
  // Parse the date string as UTC (treating input as the exact time to store)
  // This way, "2025-12-25 10:00:00" will be stored as "2025-12-25 10:00:00" UTC
  // When displayed, it will be converted to the viewer's timezone
  const parsedDate = dayjs.utc(dateString, 'YYYY-MM-DD HH:mm:ss', true);
  
  if (!parsedDate.isValid()) {
    throw new Error(`Invalid date format: ${dateString}`);
  }
  
  // Return Date object that represents the input time as UTC
  // This will be stored exactly as "YYYY-MM-DD HH:mm:ss" in the database (UTC)
  return parsedDate.toDate();
}

/**
 * Parse legacy datepicker/date-string or ISO date string.
 * Supported:
 * - "MMM D, YYYY"          (legacy UI datepicker)
 * - "YYYY-MM-DD HH:mm:ss"  (legacy DB-like string)
 * - ISO 8601
 *
 * Returns `Invalid Date` if parsing fails.
 */
export function parseDateFromIso(dateString: string): Date {
  const normalized = String(dateString).replace(/\+/g, ' ').trim();

  const legacyDate = dayjs.utc(normalized, 'MMM D, YYYY', true);
  if (legacyDate.isValid()) {
    return legacyDate.startOf('day').toDate();
  }

  const legacyDatePaddedDay = dayjs.utc(normalized, 'MMM DD, YYYY', true);
  if (legacyDatePaddedDay.isValid()) {
    return legacyDatePaddedDay.startOf('day').toDate();
  }

  const dbLikeDate = dayjs.utc(normalized, 'YYYY-MM-DD HH:mm:ss', true);
  if (dbLikeDate.isValid()) {
    return dbLikeDate.toDate();
  }

  const dateOnly = dayjs.utc(normalized, 'YYYY-MM-DD', true);
  if (dateOnly.isValid()) {
    return dateOnly.startOf('day').toDate();
  }

  const isoDate = dayjs.utc(normalized);
  return isoDate.isValid() ? isoDate.toDate() : new Date(NaN);
}


/**
 * Convert a date string (YYYY-MM-DD) to a Date object representing 2 AM
 * This matches the legacy system behavior where schedule_date is stored as "YYYY-MM-DD 02:00:00"
 * MySQL datetime fields store dates as-is without timezone conversion, so we create a Date object
 * that represents the literal time "YYYY-MM-DD 02:00:00" in UTC (which MySQL will store correctly)
 * 
 * @param dateString - Date string in format "YYYY-MM-DD"
 * @returns Date object representing 2 AM UTC on the given date (will be stored as "YYYY-MM-DD 02:00:00" in MySQL)
 * 
 * Example: convertToESTDate("2025-12-25") 
 *          returns Date representing "2025-12-25 02:00:00 UTC" which MySQL stores as "2025-12-25 02:00:00"
 */
export function convertToESTDate(dateString: string): Date {
  // Parse the date string and set time to 2 AM in UTC
  // This ensures MySQL stores it as "YYYY-MM-DD 02:00:00" without timezone conversion
  const date = dayjs.utc(`${dateString} 02:00:00`, 'YYYY-MM-DD HH:mm:ss');
  
  if (!date.isValid()) {
    throw new Error(`Invalid date format: ${dateString}`);
  }
  
  // Convert to Date object (represents 2 AM UTC, which MySQL will store as "YYYY-MM-DD 02:00:00")
  return date.toDate();
}

/**
 * Get current date/time as a Date object in EST timezone
 * This matches the legacy system behavior where dates are stored as "Y-m-d H:i:s" in EST
 * 
 * Since TypeORM is configured with timezone: 'Z' (UTC), we need to:
 * 1. Get current time in EST
 * 2. Format it as a string in EST
 * 3. Parse it as UTC so TypeORM stores the literal time value
 * 
 * This ensures the database stores "2025-12-24 09:47:29" (EST time) as-is
 * 
 * @returns Date object that will be stored as current EST time in MySQL
 */
export function getCurrentESTDate(): Date {
  // Get current time in EST timezone
  const nowEST = dayjs().tz('America/New_York');
  
  // Format as "YYYY-MM-DD HH:mm:ss" in EST
  const dateString = nowEST.format('YYYY-MM-DD HH:mm:ss');
  
  // Parse as UTC so TypeORM stores the literal time value without conversion
  // This ensures "2025-12-24 09:47:29" EST is stored as "2025-12-24 09:47:29" in MySQL
  return dayjs.utc(dateString, 'YYYY-MM-DD HH:mm:ss').toDate();
}

/**
 * Convert a UTC timestamp into an ISO string whose UTC components match the
 * Eastern wall-clock time for the same instant.
 *
 * This keeps the existing frontend timeline formatter working while the API
 * returns Eastern-aligned display values.
 */
export function formatEasternDisplayIso(date: Date): string {
  const eastern = dayjs(date).tz('America/New_York');

  if (!eastern.isValid()) {
    return date.toISOString();
  }

  return dayjs.utc(eastern.format('YYYY-MM-DD HH:mm:ss'), 'YYYY-MM-DD HH:mm:ss').toISOString();
}

/**
 * Get UTC bounds for an America/New_York calendar day.
 *
 * The application stores timestamps in UTC, but many filters and defaults are
 * defined by Eastern business days. This helper converts an Eastern date into
 * the exact UTC instants that represent the start of that day and the start of
 * the next day.
 */
export function getEasternDateRangeBounds(easternDate: string): {
  startUtc: Date;
  endExclusiveUtc: Date;
} {
  const start = dayjs.tz(`${easternDate} 00:00:00`, 'YYYY-MM-DD HH:mm:ss', 'America/New_York');

  if (!start.isValid()) {
    throw new Error(`Invalid Eastern date: ${easternDate}`);
  }

  return {
    startUtc: start.utc().toDate(),
    endExclusiveUtc: start.add(1, 'day').utc().toDate(),
  };
}

/**
 * Parse duration string (HH:mm or HH:mm:ss) and convert to decimal hours
 * 
 * @param duration - Duration string in "HH:mm" or "HH:mm:ss" format (e.g., "00:30", "01:30")
 * @returns Decimal hours (e.g., "00:30" = 0.5, "01:30" = 1.5)
 * 
 * @example
 * parseDurationToHours("00:30") // returns 0.5
 * parseDurationToHours("01:30") // returns 1.5
 * parseDurationToHours("02:00") // returns 2.0
 */
export function parseDurationToHours(duration: string): number {
  if (!duration) return 0;
  
  // Handle both "HH:mm" and "HH:mm:ss" formats
  const parts = duration.split(':');
  if (parts.length < 2) return 0;
  
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  
  // Convert to decimal hours
  return hours + (minutes / 60);
}

/**
 * Parse a duration string (HH:mm or HH:mm:ss) into total seconds.
 * PSC uses this to compute lesson end times for availability lookups.
 */
export function parseDurationToSeconds(duration: string): number {
  if (!duration) return 0;

  const parts = duration.split(':');
  if (parts.length < 2) return 0;

  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parseInt(parts[2] || '0', 10) || 0;

  return (hours * 3600) + (minutes * 60) + seconds;
}

/**
 * Calculate lesson total price based on program rate and duration
 * 
 * @param programRate - Program rate per hour (e.g., 20.00)
 * @param duration - Duration string in "HH:mm" or "HH:mm:ss" format (e.g., "00:30")
 * @returns Total price for the lesson (e.g., 20.00 * 0.5 = 10.00)
 * 
 * @example
 * calculateLessonTotal(20.00, "00:30") // returns 10.00
 * calculateLessonTotal(20.00, "01:00") // returns 20.00
 */
export function calculateLessonTotal(programRate: number, duration: string): number {
  const hours = parseDurationToHours(duration);
  const total = programRate * hours;
  // Round to 2 decimal places
  return RoundingUtils.roundDecimal(total, 2);
}

/**
 * Check if a date is a professional development day (5th occurrence of weekday in month)
 * This matches the legacy Course::isProfessionalDevelopmentDay() logic
 * 
 * The 5th occurrence of a weekday in a month is considered a professional development day.
 * Legacy logic: goes to last day of previous month, then finds "fifth [weekday]"
 * 
 * @param date - Date to check
 * @returns true if the date is a professional development day, false otherwise
 * 
 * @example
 * // If Jan 30, 2024 is the 5th Monday of January, it will return true
 * isProfessionalDevelopmentDay(new Date('2024-01-30')) // returns true
 */
export function isProfessionalDevelopmentDay(date: Date): boolean {
  const dayjsDate = dayjs.utc(date);
  const weekdayNumber = dayjsDate.day() === 0 ? 7 : dayjsDate.day(); // Convert Sunday from 0 to 7
  const weekdaysList = getWeekdaysList();
  const weekdayName = weekdaysList[weekdayNumber];
  
  if (!weekdayName) {
    return false;
  }
  
  // Match legacy logic: go to last day of previous month, then find "fifth [weekday]"
  // This finds the 5th occurrence of the weekday in the current month (month of input date)
  const lastDayOfPreviousMonth = dayjsDate.startOf('month').subtract(1, 'day');
  
  // Find the 5th occurrence of the weekday starting from the last day of previous month
  // The "fifth [weekday]" modifier in PHP finds the 5th occurrence in the current month
  const firstDayOfMonth = dayjsDate.startOf('month');
  const firstDayWeekday = firstDayOfMonth.day() === 0 ? 7 : firstDayOfMonth.day();
  
  // Calculate days to add to get to the first occurrence of the target weekday
  let daysToFirstOccurrence = 0;
  if (weekdayNumber >= firstDayWeekday) {
    daysToFirstOccurrence = weekdayNumber - firstDayWeekday;
  } else {
    daysToFirstOccurrence = (7 - firstDayWeekday) + weekdayNumber;
  }
  
  // Get the first occurrence of the weekday in the month
  const firstOccurrence = firstDayOfMonth.add(daysToFirstOccurrence, 'day');
  
  // Calculate the 5th occurrence (add 4 weeks = 28 days)
  const fifthOccurrence = firstOccurrence.add(28, 'day');
  
  // Check if the 5th occurrence exists in the same month and matches the input date
  if (fifthOccurrence.month() === dayjsDate.month() && 
      fifthOccurrence.year() === dayjsDate.year()) {
    return fifthOccurrence.format('YYYY-MM-DD') === dayjsDate.format('YYYY-MM-DD');
  }
  
  return false;
}

/**
 * Build expiry date from year and month
 * Returns last day of the month in YYYY-MM-DD format
 * 
 * @param year - Expiry year (e.g., 2026)
 * @param month - Expiry month as string (e.g., "12" or "1")
 * @returns Date string in YYYY-MM-DD format (last day of month)
 * 
 * @example
 * buildExpiryDate(2026, "12") // returns "2026-12-31"
 * buildExpiryDate(2026, "2")  // returns "2026-02-28"
 */
export function buildExpiryDate(year: number, month: string): string {
  const monthNumber = Number(month);
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    throw new Error('Invalid expiry month');
  }

  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${year}-${String(monthNumber).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * Add months to date without overflowing to next month
 * E.g., Jan 31 + 1 month = Feb 28 (not Mar 3)
 * 
 * @param date - Source date string in YYYY-MM-DD format
 * @param monthsToAdd - Number of months to add
 * @returns New date string in YYYY-MM-DD format
 * 
 * @example
 * addMonthsNoOverflow("2026-01-31", 1) // returns "2026-02-28"
 * addMonthsNoOverflow("2026-01-15", 2) // returns "2026-03-15"
 */
export function addMonthsNoOverflow(date: string, monthsToAdd: number): string {
  const sourceDate = new Date(`${date}T00:00:00Z`);
  const targetMonthIndex = sourceDate.getUTCMonth() + monthsToAdd;
  const targetYear =
    sourceDate.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  const safeDay = Math.min(sourceDate.getUTCDate(), lastDayOfTargetMonth);

  return new Date(Date.UTC(targetYear, targetMonth, safeDay))
    .toISOString()
    .slice(0, 10);
}

module.exports = {
  calculateNextPaymentDate,
  formatDateWithTime,
  createLocalDateTime,
  toLocalDateForStorage,
  formatSimpleDateTime,
  formatDate,
  formatDateYMD,
  parseFlexibleDate,
  parsePscDateOnly,
  parseUtcMonthKey,
  formatLegacyDate,
  formatLongDate,
  formatLongDateInEastern,
  formatLongDateUTC,
  getEasternDateValue,
  convertLegacyDateFormat,
  getWeekdaysList,
  formatBirthDate,
  formatDateTime,
  parseLocalDateTime,
  parseDateAsUTC,
  convertToESTDate,
  getCurrentESTDate,
  formatEasternDisplayIso,
  getEasternDateRangeBounds,
  parseDurationToHours,
  parseDurationToSeconds,
  calculateLessonTotal,
  isProfessionalDevelopmentDay,
  startOfUtcMonth,
  endOfUtcDay,
  parseDateFromIso,
  getWeekdayName,
  calculateNextWeekdayDateTime,
  formatUtcTime,
  getLegacyPscWeekday,
  buildExpiryDate,
  addMonthsNoOverflow
};
