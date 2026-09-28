export function formatLegacyDateWithTime(date: Date): string {
  const dateOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'US/Eastern',
  };

  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'US/Eastern',
  };

  const dateStr = date.toLocaleDateString('en-US', dateOptions);
  const timeStr = date.toLocaleTimeString('en-US', timeOptions);

  return `${dateStr} @ ${timeStr}`;
}

// MySQL datetime fields may be naive (no timezone)
// without applying UTC conversion. format the raw string directly when no TZ.
export function formatLegacyNaiveDateTimeString(dateTime: string): string {
  if (!dateTime) return '';

  // If the string clearly includes a timezone (ends with 'Z' or has a +/- offset), use Date formatting
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(dateTime)) {
    return formatLegacyDateWithTime(new Date(dateTime));
  }

  // Parse naive 'YYYY-MM-DD HH:MM:SS' or 'YYYY-MM-DDTHH:MM:SS'
  const match = dateTime.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    return formatLegacyDateWithTime(new Date(dateTime));
  }

  const [, y, m, d, hh, mm] = match;
  const year = Number(y);
  const month = Number(m); // 1..12
  const day = Number(d);
  const hour24 = Number(hh);
  const minute = Number(mm);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = monthNames[Math.max(0, Math.min(11, month - 1))];

  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;

  const dayStr = String(day).padStart(2, '0');
  const hourStr = String(hour12).padStart(2, '0');
  const minuteStr = String(minute).padStart(2, '0');

  return `${monthName} ${dayStr}, ${year} @ ${hourStr}:${minuteStr} ${ampm}`;
}

export function formatDuration(duration: any): string {
  try {
    if (typeof duration === 'string') {
      const timeMatch = duration.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
      if (timeMatch) {
        const hours = timeMatch[1].padStart(2, '0');
        const minutes = timeMatch[2];
        return `${hours}:${minutes}`;
      }
    }

    const durationDate = new Date(duration);
    if (!isNaN(durationDate.getTime())) {
      return durationDate.toTimeString().slice(0, 5);
    }

    return '00:00';
  } catch {
    return '00:00';
  }
}

/**
 * Converts a time string (e.g., "14:30") or Date object
 * into a formatted 12-hour time string (e.g., "02:30 PM").
 */
export function formatTime(fromTime: string | Date | null | undefined): string | null {
  if (!fromTime) return null;
  let date: Date;
  if (typeof fromTime === 'string') {
    const [hours, minutes] = fromTime.split(':').map(Number);
    date = new Date();
    date.setHours(hours, minutes, 0);
  } else if (fromTime instanceof Date) {
    date = new Date(fromTime);
  } else {
    return null;
  }
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// Format  time in Eastern timezone

export function formatEasternTime(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  
  const dateObj = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(dateObj.getTime())) return null;
  
  // Database stores times in EST/EDT, TypeORM may interpret as UTC
  // Get UTC components (which represent the stored EST/EDT time)
  const hours = dateObj.getUTCHours();
  const minutes = dateObj.getUTCMinutes();
  
  // Format time in 12-hour format with leading zero for hour
  const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hourStr = hour12.toString().padStart(2, '0');
  const minutesStr = minutes.toString().padStart(2, '0');
  
  return `${hourStr}:${minutesStr} ${ampm}`;
}


// Compute Eastern day boundaries equivalent to DATE(x) comparisons without using DATE()
export function getEasternDayBounds(ymd: string): { startOfToday: string; startOfTomorrow: string } {
  // ymd expected 'YYYY-MM-DD'
  const [y, m, d] = ymd.split('-').map((n) => Number(n));
  const start = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0));
  const next = new Date(start.getTime());
  next.setUTCDate(next.getUTCDate() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const startOfToday = `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())} 00:00:00`;
  const startOfTomorrow = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())} 00:00:00`;
  return { startOfToday, startOfTomorrow };
}

// Format date to YYYY-MM-DD string in America/New_York timezone
export function formatDateToEasternString(goToDate?: string): string {
  const currentDate = goToDate ? new Date(goToDate) : new Date();
  // Use same timezone approach as getEasternDayBounds for consistency
  const eastern = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(currentDate);
  return `${eastern.find(p => p.type === 'year')?.value}-${eastern.find(p => p.type === 'month')?.value}-${eastern.find(p => p.type === 'day')?.value}`;
}

/**
 * Format a number as currency in USD format
 * @param amount - The amount to format
 * @returns Formatted currency string (e.g., "$1,234.56")
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatPhoneNumber(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, ''); // Remove all non-digit characters
  if (digits.length === 10) { // If we have 10 digits, format as (XXX) XXX-XXXX
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

// Convert duration to hours
export function parseDurationToHours(duration: string | null | undefined): number {
  if (!duration) return 0;
  
  try {
    const timeMatch = duration.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10) || 0;
      const minutes = parseInt(timeMatch[2], 10) || 0;
      return hours + (minutes / 60);
    }
  } catch {
    return 0;
  }
  
  return 0;
}