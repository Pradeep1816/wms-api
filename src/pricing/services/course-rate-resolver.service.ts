import { Injectable, Logger } from '@nestjs/common';
import { CourseProgramRate } from '../../course/entities/course-program-rate.entity';

export type CourseRateMatch =
  /** A rate period actually contains the lesson date. */
  | 'covering'
  /** No period contains it; the most recent period before it was used. */
  | 'carried_forward'
  /** The date precedes every period; the earliest was used. */
  | 'earliest_future';

export interface ResolvedCourseRate {
  programRate: number;
  match: CourseRateMatch;
  courseProgramRateId: number;
  /** True when more than one period contained the date. */
  ambiguous: boolean;
}

/**
 * Picks the course rate that applies on a given lesson date.
 *
 * Replaces a lookup that fetched only the newest rate row and then compared the
 * lesson date against it in a branch that returned the same value either way -
 * so the date was effectively ignored and the newest rate always won.
 *
 * That was almost harmless while a course had one rate, or several at the same
 * value. It stops being harmless the moment a September-effective row exists,
 * because an August lesson would silently pick up the September rate.
 *
 * Failing closed is not an option here. Measured on 2026-08-10, **134,304 of
 * 452,466 future lessons have no rate period covering their date** - roughly
 * 30%. Renewal windows and lesson runs simply do not line up, and the old
 * comment calling the fallback "legacy behavior" was describing something
 * load-bearing. Throwing would break lesson generation for a third of the
 * schedule.
 *
 * So the rule is: use a period that covers the date; otherwise carry forward
 * the most recent period that ended before it; otherwise use the earliest
 * period. Every outcome is labelled so callers and reports can tell a real
 * match from a fallback.
 */
@Injectable()
export class CourseRateResolverService {
  private readonly logger = new Logger(CourseRateResolverService.name);

  /**
   * @param rates every rate period for one course; order does not matter
   * @param date  the lesson date as `YYYY-MM-DD`
   */
  selectRateForDate(
    rates: CourseProgramRate[],
    date: string,
  ): ResolvedCourseRate | null {
    if (rates.length === 0) {
      return null;
    }

    const day = date.slice(0, 10);

    const covering = rates.filter(
      (rate) =>
        this.day(rate.startDate) <= day && this.day(rate.endDate) >= day,
    );

    if (covering.length > 0) {
      // Deterministic tie-break: the most recently started period wins, then
      // the highest id. Measured on 2026-08-10, 2,591 future lessons fall
      // inside more than one period, so this branch is reached in practice and
      // must not depend on row order.
      const chosen = [...covering].sort((a, b) => {
        const byStart = this.day(b.startDate).localeCompare(
          this.day(a.startDate),
        );
        return byStart !== 0 ? byStart : b.id - a.id;
      })[0];

      if (covering.length > 1) {
        this.logger.warn(
          `Course ${chosen.courseId} has ${covering.length} overlapping rate periods on ${day}; using course_program_rate ${chosen.id}`,
        );
      }

      return {
        programRate: Number(chosen.programRate),
        match: 'covering',
        courseProgramRateId: chosen.id,
        ambiguous: covering.length > 1,
      };
    }

    const past = rates.filter((rate) => this.day(rate.endDate) < day);
    if (past.length > 0) {
      const chosen = [...past].sort((a, b) =>
        this.day(b.endDate).localeCompare(this.day(a.endDate)),
      )[0];

      return {
        programRate: Number(chosen.programRate),
        match: 'carried_forward',
        courseProgramRateId: chosen.id,
        ambiguous: false,
      };
    }

    const chosen = [...rates].sort((a, b) =>
      this.day(a.startDate).localeCompare(this.day(b.startDate)),
    )[0];

    return {
      programRate: Number(chosen.programRate),
      match: 'earliest_future',
      courseProgramRateId: chosen.id,
      ambiguous: false,
    };
  }

  /**
   * The rate rows a renewal must create so its whole window is priced, without
   * overlapping the periods that already exist.
   *
   * Auto-renewal previously wrote a single row spanning the entire renewal
   * window - 25 months - at the flat `program.rate`. One row cannot express a
   * price change part-way through its own span, so that structure could not
   * represent 1 September 2026 at all, and every run minted old-priced lessons
   * years into the future.
   *
   * This returns only the **gaps**: sub-ranges of the window that no existing
   * period covers. Where a future-dated period already exists - which is how
   * the September catalogue reaches a course - it is left alone and the
   * renewal simply fills around it. A gap inherits the rate in effect
   * immediately before it, falling back to `fallbackRate` when nothing
   * precedes it.
   *
   * @param windowStart inclusive, `YYYY-MM-DD`
   * @param windowEnd   inclusive, `YYYY-MM-DD`
   */
  planRenewalRateRows(
    existingRates: CourseProgramRate[],
    windowStart: string,
    windowEnd: string,
    fallbackRate: number,
  ): Array<{ startDate: string; endDate: string; programRate: number }> {
    const start = windowStart.slice(0, 10);
    const end = windowEnd.slice(0, 10);

    if (start > end) {
      return [];
    }

    const covering = existingRates
      .map((rate) => ({
        start: this.day(rate.startDate),
        end: this.day(rate.endDate),
        programRate: Number(rate.programRate),
      }))
      .filter((rate) => rate.end >= start && rate.start <= end)
      .sort((a, b) => a.start.localeCompare(b.start));

    const planned: Array<{
      startDate: string;
      endDate: string;
      programRate: number;
    }> = [];
    let cursor = start;

    for (const rate of covering) {
      if (rate.start > cursor) {
        planned.push({
          startDate: cursor,
          endDate: this.previousDay(rate.start),
          programRate: this.rateInEffectBefore(
            existingRates,
            cursor,
            fallbackRate,
          ),
        });
      }
      if (rate.end >= cursor) {
        cursor = this.nextDay(rate.end);
      }
      if (cursor > end) {
        break;
      }
    }

    if (cursor <= end) {
      planned.push({
        startDate: cursor,
        endDate: end,
        programRate: this.rateInEffectBefore(
          existingRates,
          cursor,
          fallbackRate,
        ),
      });
    }

    return planned;
  }

  /**
   * The rate rows a **newly created** course needs so that a window spanning
   * 1 September 2026 is priced correctly on both sides of it.
   *
   * Enrolment creation writes one rate row covering the whole course. That is
   * fine until the course crosses the cutover, at which point a single row
   * prices September lessons at August's rate - the same structural problem
   * auto-renewal had, arriving through a different door. The migration does not
   * close this one: it stages rates for enrolments that existed when it ran, so
   * anything created between now and 1 September would otherwise be minted on
   * old pricing and stay there.
   *
   * Returns one row when the window does not cross the cutover, or when the two
   * rates are equal - there is no reason to split a course into two identical
   * periods.
   *
   * @param windowStart  inclusive, `YYYY-MM-DD`
   * @param windowEnd    inclusive, `YYYY-MM-DD`
   * @param currentRate  the rate in force at the start of the window
   * @param cutoverDate  first day the new rate applies, `YYYY-MM-DD`
   * @param cutoverRate  the rate from that day, or `null` when the catalogue
   *                     has no answer and the current rate should simply run on
   */
  planNewCourseRateRows(
    windowStart: string,
    windowEnd: string,
    currentRate: number,
    cutoverDate: string,
    cutoverRate: number | null,
  ): Array<{ startDate: string; endDate: string; programRate: number }> {
    const start = windowStart.slice(0, 10);
    const end = windowEnd.slice(0, 10);

    if (start > end) {
      return [];
    }

    const whole = [
      { startDate: start, endDate: end, programRate: currentRate },
    ];

    if (cutoverRate === null || cutoverRate === currentRate) {
      return whole;
    }

    // Entirely on one side of the cutover: one row, at whichever rate applies.
    if (cutoverDate <= start) {
      return [{ startDate: start, endDate: end, programRate: cutoverRate }];
    }
    if (cutoverDate > end) {
      return whole;
    }

    return [
      {
        startDate: start,
        endDate: this.previousDay(cutoverDate),
        programRate: currentRate,
      },
      { startDate: cutoverDate, endDate: end, programRate: cutoverRate },
    ];
  }

  /** The rate applying immediately before a day, for carrying forward. */
  private rateInEffectBefore(
    rates: CourseProgramRate[],
    day: string,
    fallbackRate: number,
  ): number {
    const before = rates
      .filter((rate) => this.day(rate.endDate) < day)
      .sort((a, b) => this.day(b.endDate).localeCompare(this.day(a.endDate)));

    return before.length > 0 ? Number(before[0].programRate) : fallbackRate;
  }

  private nextDay(day: string): string {
    const date = new Date(`${day}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }

  private previousDay(day: string): string {
    const date = new Date(`${day}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  /** Rate periods are `date` columns; compare them as plain calendar days. */
  private day(value: Date | string): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }
    return value.toISOString().slice(0, 10);
  }
}
