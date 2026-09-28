// Match the sender's Eastern wall-clock storage and its one-day lookahead.
// No dependency on the MySQL timezone tables or the deployment host's timezone.
export function futureNotificationCutoff(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const eastern = new Date(
    `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}Z`,
  );
  eastern.setUTCDate(eastern.getUTCDate() + 1);
  return eastern.toISOString().slice(0, 19).replace('T', ' ');
}

