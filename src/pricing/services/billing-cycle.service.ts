import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SEPTEMBER_2026_EFFECTIVE_FROM } from '../constants/september-2026-tuition';

export interface StraddlingCycle {
  enrolmentId: number;
  /** `YYYY-MM-DD`. */
  startDate: string;
  /** `YYYY-MM-DD`. */
  endDate: string;
}

/**
 * When a new rate may start for one enrolment.
 *
 * A cycle that **straddles** the cutover - begins before it and ends on or after
 * it - keeps its current rate to the end, so the new rate starts the day after.
 * Anything else starts on the cutover itself.
 *
 * Pure, so the rule can be tested without a database and read without one.
 */
export function effectiveDateForCycle(
  cycle: { startDate: string; endDate: string } | null,
  cutover: string = SEPTEMBER_2026_EFFECTIVE_FROM,
): string {
  if (cycle === null) {
    return cutover;
  }

  // A cycle beginning on or after the cutover is already a new cycle; the new
  // rate applies from its start, which is the cutover or later.
  if (cycle.startDate >= cutover) {
    return cutover;
  }

  if (cycle.endDate < cutover) {
    return cutover;
  }

  return dayAfter(cycle.endDate);
}

function dayAfter(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Resolves the date each enrolment's new rate may start.
 *
 * ## Why this exists - the gap found on 2026-08-12
 *
 * `MigrationStagingService` staged every enrolment from a flat
 * `SEPTEMBER_2026_EFFECTIVE_FROM` and never read `payment_frequency` or
 * `payment_cycle` at all. Arcadia has answered this twice - C6 on 2026-08-04 and
 * C15 on 2026-08-12 - and both times said a cycle straddling the cutover keeps
 * its rate **to the end of that cycle**, with C15 adding that the cycle belongs
 * to the enrolment rather than the location.
 *
 * ## What the data says
 *
 * Measured across the 2,872 live enrolments running past the cutover:
 *
 * | | Enrolments |
 * | --- | --- |
 * | New rate starts 1 September | 2,545 |
 * | Deferred - a cycle straddles the cutover | **327** |
 *
 * Monthly customers are almost entirely unaffected: 2,120 of them have a cycle
 * beginning exactly on 1 September, so nothing defers. The deferrals are the
 * quarterly, semi-annual and annual plans - 142 move on 1 October, 106 on 1
 * November, and a thin tail runs to **1 August 2027**, where three annual
 * customers keep the previous rate for a further eleven months.
 *
 * That tail is a consequence of Arcadia's own answer rather than a defect, but
 * it is worth their knowing: some customers will be on the old sheet for most of
 * a year, entirely correctly.
 */
@Injectable()
export class BillingCycleService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * The effective date for each enrolment, keyed by id.
   *
   * One query for the whole batch. Enrolments with no cycle covering the cutover
   * - 233 of them, mostly monthly plans whose next cycle has not been created
   * yet - are absent from the result and fall back to the cutover.
   */
  async resolveEffectiveDates(
    enrolmentIds: number[],
    cutover: string = SEPTEMBER_2026_EFFECTIVE_FROM,
  ): Promise<Map<number, string>> {
    const dates = new Map<number, string>();

    if (enrolmentIds.length === 0) {
      return dates;
    }

    const cycles = await this.findStraddlingCycles(enrolmentIds, cutover);

    for (const enrolmentId of enrolmentIds) {
      dates.set(enrolmentId, cutover);
    }

    for (const cycle of cycles) {
      dates.set(
        cycle.enrolmentId,
        effectiveDateForCycle(
          { startDate: cycle.startDate, endDate: cycle.endDate },
          cutover,
        ),
      );
    }

    return dates;
  }

  /**
   * The cycle covering the cutover for each enrolment that has one.
   *
   * `ORDER BY startDate DESC` inside the correlated lookup matters: an enrolment
   * can carry more than one cycle row spanning a date, and the most recently
   * started one is the live cycle.
   */
  async findStraddlingCycles(
    enrolmentIds: number[],
    cutover: string = SEPTEMBER_2026_EFFECTIVE_FROM,
  ): Promise<StraddlingCycle[]> {
    if (enrolmentIds.length === 0) {
      return [];
    }

    const rows: Array<{
      enrolmentId: number | string;
      startDate: string;
      endDate: string;
    }> = await this.dataSource.query(
      `SELECT pc.enrolmentId  AS enrolmentId,
              DATE_FORMAT(pc.startDate, '%Y-%m-%d') AS startDate,
              DATE_FORMAT(pc.endDate,   '%Y-%m-%d') AS endDate
         FROM payment_cycle pc
        WHERE pc.isDeleted = 0
          AND pc.enrolmentId IN (?)
          AND pc.startDate < ?
          AND pc.endDate  >= ?
          AND pc.id = (SELECT p2.id
                         FROM payment_cycle p2
                        WHERE p2.enrolmentId = pc.enrolmentId
                          AND p2.isDeleted = 0
                          AND ? BETWEEN p2.startDate AND p2.endDate
                        ORDER BY p2.startDate DESC, p2.id DESC
                        LIMIT 1)`,
      [enrolmentIds, cutover, cutover, cutover],
    );

    return rows.map((row) => ({
      enrolmentId: Number(row.enrolmentId),
      startDate: row.startDate,
      endDate: row.endDate,
    }));
  }
}
