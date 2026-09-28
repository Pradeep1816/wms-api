/**
 * Canonical parser for the human-readable weekly slot accepted by the PSC API.
 * It retains the legacy Monday-to-Sunday numbering and emits database time.
 */
const PERMANENT_SCHEDULE_SLOT_PATTERN =
  /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+(0?[1-9]|1[0-2]):([0-5]\d)\s+(AM|PM)$/i;

const LEGACY_DAY_NUMBER: Record<string, number> = {
  sunday: 7,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** Normalized weekday and 24-hour database time produced from a PSC slot. */
export interface PermanentScheduleSlot {
  day: number;
  fromTime: string;
}

/** Parse the PSC UI value, for example `Monday 04:00 PM`. */
export function parsePermanentScheduleSlot(
  value: string,
): PermanentScheduleSlot {
  const match = PERMANENT_SCHEDULE_SLOT_PATTERN.exec(String(value).trim());
  if (!match) {
    throw new Error('Invalid dayTime format');
  }

  const day = LEGACY_DAY_NUMBER[match[1].toLowerCase()];
  let hours = Number(match[2]);
  const minutes = match[3];
  const meridiem = match[4].toUpperCase();

  if (meridiem === 'PM' && hours !== 12) {
    hours += 12;
  } else if (meridiem === 'AM' && hours === 12) {
    hours = 0;
  }

  return {
    day,
    fromTime: `${String(hours).padStart(2, '0')}:${minutes}:00`,
  };
}
