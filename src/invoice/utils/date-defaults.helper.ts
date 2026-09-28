/**
 * Get previous week Monday date in YYYY-MM-DD format
 * Example: Today is Feb 11, 2026 (Wed) → Returns "2026-02-02" (previous Monday)
 */
export function getPreviousWeekMonday(): string {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  
  // Calculate days to subtract to get to previous Monday
  // If today is Sunday (0), go back 6 days
  // If today is Monday (1), go back 7 days
  // If today is Tuesday (2), go back 8 days, etc.
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek + 6;
  
  const previousMonday = new Date(today);
  previousMonday.setDate(today.getDate() - daysToSubtract);
  
  return previousMonday.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Get previous week Saturday date in YYYY-MM-DD format
 * Example: Today is Feb 11, 2026 (Wed) → Returns "2026-02-07" (previous Saturday)
 */
export function getPreviousWeekSaturday(): string {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  
  // Calculate days to subtract to get to previous Saturday
  // If today is Sunday (0), go back 1 day
  // If today is Monday (1), go back 2 days
  // If today is Saturday (6), go back 7 days
  const daysToSubtract = dayOfWeek === 0 ? 1 : dayOfWeek + 1;
  
  const previousSaturday = new Date(today);
  previousSaturday.setDate(today.getDate() - daysToSubtract);
  
  return previousSaturday.toISOString().split('T')[0]; // YYYY-MM-DD
}
