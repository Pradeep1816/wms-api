/** Calendar day without shifting a hydrated local datetime through UTC. */
export function validCourseDay(value: unknown): string | null {
  let day: string;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    day = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  } else if (typeof value === 'string') {
    if (
      !/^\d{4}-\d{2}-\d{2}(?:$|[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?$)/.test(value)
    )
      return null;
    day = value.slice(0, 10);
  } else {
    return null;
  }
  if (day < '1000-01-01' || day > '9999-12-31') return null;
  const parsed = new Date(`${day}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === day
    ? day
    : null;
}

export function hasValidCourseBounds(first: unknown, last: unknown): boolean {
  const start = validCourseDay(first);
  const end = validCourseDay(last);
  return start !== null && end !== null && start <= end;
}

/** Trusted column names only. Exclude legacy zero/partial/impossible dates before MIN/MAX. */
export function validCourseDateSql(column: 'lesson.date' | 'l.date'): string {
  return `YEAR(${column}) BETWEEN 1000 AND 9999 AND MONTH(${column}) BETWEEN 1 AND 12 AND DAYOFMONTH(${column}) BETWEEN 1 AND DAYOFMONTH(LAST_DAY(${column}))`;
}
