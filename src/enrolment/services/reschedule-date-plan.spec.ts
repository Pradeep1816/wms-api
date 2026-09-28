import { describe, expect, it } from 'vitest';
import { planRescheduleDates } from '../permanent-schedule-change/domain/permanent-schedule-planner';

/**
 * A permanent schedule change replaces each future lesson with one on the new
 * day. These cover where those replacements land.
 *
 * The behaviour under test was reported by Arcadia three times in two weeks and
 * reproduced on 2026-08-19 against Burlington enrolment 34472: a
 * Thursday-to-Monday move effective 7 September held its alignment until the
 * old run skipped a professional-development Thursday the new run did not have,
 * then paired the old 5 November lesson with a new one on 26 October. Sixty of
 * the ninety-nine replacements ended up ten days early rather than three.
 */
describe('planRescheduleDates', () => {
  const MONDAY = 1;
  const TUESDAY = 2;
  const WEDNESDAY = 3;
  const THURSDAY = 4;
  const FRIDAY = 5;
  const SATURDAY = 6;
  const SUNDAY = 0;

  const days = (...iso: string[]) => iso.map((value) => new Date(`${value}T18:30:00.000Z`));
  const asIso = (dates: Date[]) => dates.map((date) => date.toISOString().slice(0, 10));

  describe('moving Thursdays to Mondays', () => {
    it('puts each lesson on the Monday of its own week', () => {
      const planned = planRescheduleDates(
        days('2026-09-10', '2026-09-17', '2026-09-24'),
        MONDAY,
        new Date('2026-09-07T00:00:00.000Z'),
      );

      expect(asIso(planned)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21']);
    });

    /**
     * A lesson may be missing from the old run because it was cancelled or
     * otherwise adjusted. Later replacements must not drift because of the gap.
     */
    it('does NOT shift later lessons when the old run has a gap', () => {
      const planned = planRescheduleDates(
        // 17 September is missing.
        days('2026-09-10', '2026-09-24', '2026-10-01'),
        MONDAY,
        new Date('2026-09-07T00:00:00.000Z'),
      );

      // Each keeps its own week. The old behaviour returned 09-07, 09-14,
      // 09-21 - every lesson after the gap a week early.
      expect(asIso(planned)).toEqual(['2026-09-07', '2026-09-21', '2026-09-28']);
    });

    it('survives several gaps without drifting', () => {
      const planned = planRescheduleDates(
        days('2026-09-10', '2026-10-08', '2026-11-05'),
        MONDAY,
        new Date('2026-09-07T00:00:00.000Z'),
      );

      expect(asIso(planned)).toEqual(['2026-09-07', '2026-10-05', '2026-11-02']);
    });
  });

  describe('first week of the selected month', () => {
    it("moves Haysen's Wednesday September 2 lesson to Saturday September 5", () => {
      const planned = planRescheduleDates(
        days('2026-09-02', '2026-09-09'),
        SATURDAY,
        new Date('2026-09-05T00:00:00.000Z'),
      );

      expect(asIso(planned)).toEqual(['2026-09-05', '2026-09-12']);
    });

    it("moves Eowyn's Tuesday September 1 lesson to Wednesday September 2", () => {
      const planned = planRescheduleDates(
        days('2026-09-01', '2026-09-08'),
        WEDNESDAY,
        new Date('2026-09-02T00:00:00.000Z'),
      );

      expect(asIso(planned)).toEqual(['2026-09-02', '2026-09-09']);
    });

    it('keeps a same-day PSC on the first day of the month', () => {
      const planned = planRescheduleDates(
        days('2026-09-01', '2026-09-08'),
        TUESDAY,
        new Date('2026-09-01T00:00:00.000Z'),
      );

      expect(asIso(planned)).toEqual(['2026-09-01', '2026-09-08']);
    });
  });

  /**
   * Reported by Arcadia on 2026-08-20 for Burlington enrolment 17510: a change
   * effective Friday 4 September that moved Mondays to Fridays produced its
   * first lesson on the 11th, leaving the effective date empty. Legacy starts
   * on the first target weekday on or after the effective day, and Arcadia
   * treat that as the spec.
   */
  describe('starting where legacy would start', () => {
    it('pulls the run back a week when own-week anchoring lands late', () => {
      const planned = planRescheduleDates(
        days('2026-09-07'),
        FRIDAY,
        new Date('2026-09-04T00:00:00.000Z'),
      );

      // The 7th's own Friday is the 11th; legacy's first slot is the 4th.
      expect(asIso(planned)).toEqual(['2026-09-04']);
    });

    /**
     * The move Arcadia reported on 2026-08-21 as "the first lesson was
     * missing": the new weekday's first occurrence falls BEFORE the old
     * weekday's, so own-week anchoring left the effective week empty.
     */
    it('fills the effective week on a Monday-to-Thursday move', () => {
      const planned = planRescheduleDates(
        days('2026-09-07', '2026-09-14', '2026-09-21'),
        THURSDAY,
        new Date('2026-09-03T00:00:00.000Z'),
      );

      expect(asIso(planned)).toEqual(['2026-09-03', '2026-09-10', '2026-09-17']);
    });

    /**
     * The pull-back must not disturb a run that already starts correctly.
     * Teo Insausti's shape: the first lesson in the month sits BEFORE the
     * effective day and is pushed forward onto it, so nothing moves. Deriving
     * one offset from that first pairing instead shifted 98 of his 99 lessons.
     */
    it('leaves the run alone when the first lesson precedes the effective day', () => {
      const planned = planRescheduleDates(
        days('2026-09-03', '2026-09-17', '2026-09-24'),
        MONDAY,
        new Date('2026-09-07T00:00:00.000Z'),
      );

      expect(asIso(planned)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21']);
    });

    it('starts on the effective date itself, as legacy did', () => {
      const planned = planRescheduleDates(
        days('2026-09-07', '2026-09-14', '2026-09-21'),
        FRIDAY,
        new Date('2026-09-04T00:00:00.000Z'),
      );

      expect(asIso(planned)).toEqual(['2026-09-04', '2026-09-11', '2026-09-18']);
    });

    it('still refuses to go before the effective date', () => {
      const planned = planRescheduleDates(
        days('2026-09-07'),
        FRIDAY,
        // The Friday before, 4 September, is out of bounds.
        new Date('2026-09-07T00:00:00.000Z'),
      );

      expect(asIso(planned)).toEqual(['2026-09-11']);
    });

    /**
     * The anti-drift property has to survive the new offsets - it is the whole
     * reason this function exists.
     */
    it('does NOT shift later lessons when the old run has a gap', () => {
      const planned = planRescheduleDates(
        // 14 September is missing.
        days('2026-09-07', '2026-09-21', '2026-09-28'),
        FRIDAY,
        new Date('2026-09-04T00:00:00.000Z'),
      );

      expect(asIso(planned)).toEqual(['2026-09-04', '2026-09-18', '2026-09-25']);
    });

    it('keeps the run ascending when two old lessons share a week', () => {
      const planned = planRescheduleDates(
        days('2026-09-07', '2026-09-09'),
        FRIDAY,
        new Date('2026-09-04T00:00:00.000Z'),
      );

      expect(asIso(planned)).toEqual(['2026-09-04', '2026-09-11']);
    });

    it('leaves a move of three days or less alone', () => {
      // Thursday to Monday is already the nearest Monday; Teo Insausti's
      // change, which must not move.
      const planned = planRescheduleDates(
        days('2026-09-10', '2026-09-17'),
        MONDAY,
        new Date('2026-09-07T00:00:00.000Z'),
      );

      expect(asIso(planned)).toEqual(['2026-09-07', '2026-09-14']);
    });
  });

  describe('the day the change takes effect', () => {
    it('never schedules before it', () => {
      const planned = planRescheduleDates(
        days('2026-09-10'),
        MONDAY,
        // The Monday of that week, 7 September, is out of bounds.
        new Date('2026-09-08T00:00:00.000Z'),
      );

      expect(asIso(planned)).toEqual(['2026-09-14']);
    });

    it('allows a lesson exactly on the boundary', () => {
      const planned = planRescheduleDates(
        days('2026-09-10'),
        MONDAY,
        new Date('2026-09-07T00:00:00.000Z'),
      );

      expect(asIso(planned)).toEqual(['2026-09-07']);
    });

    it('accepts no boundary at all', () => {
      const planned = planRescheduleDates(days('2026-09-10'), MONDAY, null);
      expect(asIso(planned)).toEqual(['2026-09-07']);
    });
  });

  describe('ordering and collisions', () => {
    it('pushes a second lesson in the same week to the next one', () => {
      const planned = planRescheduleDates(
        // Two lessons in the week of 7 September - an extra, or a make-up.
        days('2026-09-08', '2026-09-10'),
        MONDAY,
        null,
      );

      expect(asIso(planned)).toEqual(['2026-09-07', '2026-09-14']);
    });

    it('always returns one date per lesson, ascending', () => {
      const planned = planRescheduleDates(
        days('2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01'),
        MONDAY,
        null,
      );

      expect(planned).toHaveLength(4);
      const times = planned.map((d) => d.getTime());
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    });
  });

  describe('other directions', () => {
    it('moves Mondays later in the same week', () => {
      const planned = planRescheduleDates(
        days('2026-09-07', '2026-09-14'),
        THURSDAY,
        null,
      );

      expect(asIso(planned)).toEqual(['2026-09-10', '2026-09-17']);
    });

    /**
     * Sunday is day 0, so the Sunday of a Thursday's own week is four days
     * BEHIND it. With no boundary there is no legacy answer to reproduce, so
     * the own-week Sunday stands.
     */
    it('handles Sunday, which is day 0 rather than day 7', () => {
      const planned = planRescheduleDates(days('2026-09-10'), SUNDAY, null);
      expect(asIso(planned)).toEqual(['2026-09-06']);
    });

    /**
     * Given a boundary, the effective day settles the direction on its own -
     * no special case for Sunday. Legacy would have started on the 13th here,
     * so the run is pulled forward to match.
     */
    it('follows the effective day when one is given', () => {
      const planned = planRescheduleDates(
        days('2026-09-10', '2026-09-17'),
        SUNDAY,
        new Date('2026-09-13T00:00:00.000Z'),
      );

      expect(asIso(planned)).toEqual(['2026-09-13', '2026-09-20']);
    });

    it('returns nothing for nothing', () => {
      expect(planRescheduleDates([], MONDAY, null)).toEqual([]);
    });
  });

  describe('skipped days', () => {
    it('moves a lesson a week on when its slot is a skipped day', () => {
      const skipped = (day: Date) => day.toISOString().slice(0, 10) === '2026-09-14';

      const planned = planRescheduleDates(
        days('2026-09-10', '2026-09-17'),
        MONDAY,
        null,
        skipped,
      );

      // The second would have been 14 September; it moves to the 21st, and the
      // first is untouched.
      expect(asIso(planned)).toEqual(['2026-09-07', '2026-09-21']);
    });
  });

  /**
   * The property that matters, rather than another handful of examples: for
   * every weekday move a studio can actually make, our first replacement lands
   * on the same date legacy's would.
   *
   * "Actually make" matters - the effective day is not free. Staff pick the new
   * slot by clicking the calendar, which sets it to that weekday in the week of
   * the 1st, and validation then requires it to fall in the first seven days of
   * the month.
   */
  /**
   * The correction undoes an artefact of the Sunday week boundary, and that
   * artefact is one week by construction. A longer gap is not a boundary
   * effect - it is the student having no lesson until later, and pulling their
   * run back to the effective day would invent lessons during a break.
   *
   * Legacy does pull them back. This is a deliberate departure, measured
   * against the 2026-08-19 production snapshot: 81 of 3,212 live courses have
   * their first lesson of the month two or more weeks in, the longest 67 days.
   */
  /**
   * Newmarket, Alex Gabriel, course 31946, reported 2026-08-21 as "the first
   * lesson was missing". It is a time-only change - Thursday 16:30 to Thursday
   * 17:00, effective Thursday 3 September - so the weekday never moves, and the
   * month boundary makes no difference. The damage came from a make-up.
   *
   * On 14 August staff moved his 3 September lesson to MONDAY 14 September. It
   * is a regular lesson on the same course, so the change picked it up, and the
   * Thursday of its own week is the 17th - already taken. The ascending guard
   * then bumped the 17th to the 24th, the 24th to the 1st, and so on: 74 of his
   * 76 lessons a week late, and the enrolment two weeks longer.
   *
   * Pulling the run back to where legacy would start it absorbs the collision
   * instead, and fills the 3 September slot that was left empty.
   */
  describe('a make-up lesson sitting on a different weekday', () => {
    it('does not bump every lesson behind it', () => {
      const planned = planRescheduleDates(
        // 14 September is the make-up, moved off Thursday the 3rd.
        days('2026-09-10', '2026-09-14', '2026-09-17', '2026-09-24', '2026-10-01'),
        THURSDAY,
        new Date('2026-09-03T00:00:00.000Z'),
      );

      // Without the correction this returned 09-10, 09-17, 09-24, 10-01, 10-08:
      // the make-up took the 17th and pushed everything behind it a week.
      expect(asIso(planned)).toEqual([
        '2026-09-03',
        '2026-09-10',
        '2026-09-17',
        '2026-09-24',
        '2026-10-01',
      ]);
    });
  });

  describe('a student on a break', () => {
    it('does not drag the run back to the effective day', () => {
      const planned = planRescheduleDates(
        // Nothing until late October; the change is effective 4 September.
        days('2026-10-19', '2026-10-26'),
        FRIDAY,
        new Date('2026-09-04T00:00:00.000Z'),
      );

      // Nothing moves. Legacy would have started this on 4 September, six
      // weeks early; clamping the correction to one week instead of rejecting
      // it moved them to 16 and 23 October, which was just as wrong - a change
      // that only alters the time must not move a date.
      expect(asIso(planned)).toEqual(['2026-10-23', '2026-10-30']);
    });

    /**
     * Dev course 32383, found by the scenario matrix on 2026-08-21: a Sunday
     * course whose next lesson was seven weeks out, given a change that altered
     * only the TIME. Clamping the correction to one week dragged every lesson
     * back seven days - 25 October became 18 October.
     */
    it('moves no date at all when only the time changes', () => {
      const olds = ['2026-10-25', '2026-11-01', '2026-11-08', '2026-11-15'];
      const planned = planRescheduleDates(
        olds.map((d) => new Date(`${d}T09:30:00.000Z`)),
        SUNDAY,
        new Date('2026-09-06T00:00:00.000Z'),
      );

      expect(asIso(planned)).toEqual(olds);
    });

    it('still corrects a genuine one-week boundary artefact', () => {
      const planned = planRescheduleDates(
        days('2026-09-07', '2026-09-14'),
        FRIDAY,
        new Date('2026-09-04T00:00:00.000Z'),
      );

      expect(asIso(planned)).toEqual(['2026-09-04', '2026-09-11']);
    });
  });

  describe('legacy parity, enumerated', () => {
    const legacyFirstDate = (target: number, effective: string): string => {
      const cursor = new Date(`${effective}T00:00:00.000Z`);
      while (cursor.getUTCDay() !== target) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      return cursor.toISOString().slice(0, 10);
    };

    // The weekday the staff member clicks, in the calendar week of the 1st.
    const clickedDay = (target: number, year: number, month: number): string => {
      const first = new Date(Date.UTC(year, month, 1));
      const monday = new Date(first);
      const weekday = first.getUTCDay();
      monday.setUTCDate(first.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
      monday.setUTCDate(monday.getUTCDate() + ((target + 6) % 7));
      return monday.toISOString().slice(0, 10);
    };

    const weeklyRun = (weekday: number, year: number, month: number): string[] => {
      const cursor = new Date(Date.UTC(year, month, 1));
      while (cursor.getUTCDay() !== weekday) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      return Array.from({ length: 5 }, () => {
        const value = cursor.toISOString().slice(0, 10);
        cursor.setUTCDate(cursor.getUTCDate() + 7);
        return value;
      });
    };

    const months: [number, number][] = [
      [2026, 8],
      [2026, 9],
      [2026, 10],
      [2027, 1],
    ];

    it('starts every weekday move on the date legacy would', () => {
      let checked = 0;

      for (const [year, month] of months) {
        const monthStart = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
        const weekEnd = new Date(Date.UTC(year, month, 7)).toISOString().slice(0, 10);

        for (let from = 0; from < 7; from++) {
          for (let to = 0; to < 7; to++) {
            if (from === to) continue;

            const effective = clickedDay(to, year, month);
            // Outside the first seven days the wizard rejects it anyway.
            if (effective < monthStart || effective > weekEnd) continue;

            const planned = planRescheduleDates(
              weeklyRun(from, year, month).map((value) => new Date(`${value}T18:30:00.000Z`)),
              to,
              new Date(`${effective}T00:00:00.000Z`),
            );

            expect(asIso(planned)[0]).toBe(legacyFirstDate(to, effective));
            checked++;
          }
        }
      }

      expect(checked).toBeGreaterThan(100);
    });

    it('keeps every run ascending, distinct, on the target weekday and in bounds', () => {
      for (const [year, month] of months) {
        const monthStart = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
        const weekEnd = new Date(Date.UTC(year, month, 7)).toISOString().slice(0, 10);

        for (let from = 0; from < 7; from++) {
          for (let to = 0; to < 7; to++) {
            if (from === to) continue;
            const effective = clickedDay(to, year, month);
            if (effective < monthStart || effective > weekEnd) continue;

            const planned = asIso(
              planRescheduleDates(
                weeklyRun(from, year, month).map((value) => new Date(`${value}T18:30:00.000Z`)),
                to,
                new Date(`${effective}T00:00:00.000Z`),
              ),
            );

            expect(new Set(planned).size).toBe(planned.length);
            expect([...planned].sort()).toEqual(planned);
            expect(planned.every((date) => date >= effective)).toBe(true);
            expect(
              planned.every((date) => new Date(`${date}T00:00:00.000Z`).getUTCDay() === to),
            ).toBe(true);
          }
        }
      }
    });
  });

  it('does not mutate the dates it is given', () => {
    const input = days('2026-09-10');
    const before = input[0].toISOString();

    planRescheduleDates(input, MONDAY, null);

    expect(input[0].toISOString()).toBe(before);
  });

  /**
   * A month can come up one lesson short even though every replacement is in
   * the right week, and a prepaid cycle then bills that month short. Reported
   * by Arcadia on 2026-08-31 against a Tier 2 six-month cycle that billed
   * $1,437.50 of a published $1,500 - twenty-three lessons at $62.50, not
   * twenty-four.
   *
   * Verified against the legacy application on 2026-08-31: running the real
   * `CourseReschedule::reschdeule` under PHP 7.1 for the same move puts four
   * lessons in December, on the 2nd, 9th, 16th and 23rd.
   */
  describe('keeping a month as full as it was', () => {
    const isFifthWeekdayOfMonth = (day: Date): boolean => {
      const fifth = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
      let seen = 0;
      while (fifth.getUTCMonth() === day.getUTCMonth()) {
        if (fifth.getUTCDay() === day.getUTCDay()) {
          seen += 1;
          if (seen === 5) {
            return fifth.getUTCDate() === day.getUTCDate();
          }
        }
        fifth.setUTCDate(fifth.getUTCDate() + 1);
      }
      return false;
    };

    // Mondays from October 2026. 30 November is the fifth Monday, so the old
    // run has no lesson that week - which is why nothing maps to 2 December.
    const oldMondays = days(
      '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26',
      '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23',
      '2026-12-07', '2026-12-14', '2026-12-21', '2026-12-28',
      '2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25',
    );

    it('gives December its fourth lesson back', () => {
      const planned = planRescheduleDates(
        oldMondays,
        WEDNESDAY,
        new Date('2026-10-01T00:00:00.000Z'),
        isFifthWeekdayOfMonth,
      );

      const december = asIso(planned).filter((date) => date.startsWith('2026-12'));

      // Was 09, 16, 23 - the 30th is the fifth Wednesday and closed, so that
      // lesson was pushed into January and every later lesson with it.
      expect(december).toEqual(['2026-12-02', '2026-12-09', '2026-12-16', '2026-12-23']);
    });

    it('re-anchors from the following month rather than staying early', () => {
      const planned = planRescheduleDates(
        oldMondays,
        WEDNESDAY,
        new Date('2026-10-01T00:00:00.000Z'),
        isFifthWeekdayOfMonth,
      );

      // Only December moves. January is back in each lesson's own week, which
      // is where legacy would NOT have put it - it counts forward and stays a
      // week early for the rest of the run.
      expect(asIso(planned).filter((d) => d.startsWith('2027-01'))).toEqual([
        '2027-01-06', '2027-01-13', '2027-01-20', '2027-01-27',
      ]);
      expect(asIso(planned).filter((d) => d.startsWith('2026-10'))).toEqual([
        '2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28',
      ]);
    });

    it('leaves a run alone when no month is short', () => {
      const planned = planRescheduleDates(
        days('2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'),
        WEDNESDAY,
        new Date('2026-10-01T00:00:00.000Z'),
        isFifthWeekdayOfMonth,
      );

      expect(asIso(planned)).toEqual([
        '2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28',
      ]);
    });

    it('never pulls a lesson further than one week before its own', () => {
      const planned = planRescheduleDates(
        oldMondays,
        WEDNESDAY,
        new Date('2026-10-01T00:00:00.000Z'),
        isFifthWeekdayOfMonth,
      );

      planned.forEach((date, index) => {
        const ownWeek = new Date(oldMondays[index]);
        ownWeek.setUTCHours(0, 0, 0, 0);
        ownWeek.setUTCDate(ownWeek.getUTCDate() + (WEDNESDAY - ownWeek.getUTCDay()));
        const daysEarly = (ownWeek.getTime() - date.getTime()) / 86400000;
        expect(daysEarly).toBeLessThanOrEqual(7);
      });
    });

    /**
     * A run can hold more than one structurally short month, and the first
     * masks the second.
     *
     * June 2027 is December's twin: 31 May is the fifth Monday, so 2 June has
     * no lesson to fill it, and 30 June is the fifth Wednesday. The lessons
     * displaced out of December were landing in June and making it look full,
     * so repairing December uncovered June and left the total unchanged - and a
     * repair judged on the total was rejected, fixing neither.
     *
     * Found on dev on 2026-08-31 against a twelve-month term. A six-month term
     * ends before June, which is why the first round of testing missed it.
     */
    it('repairs every short month, not just the first', () => {
      const mondays: Date[] = [];
      const cursor = new Date('2026-09-07T18:45:00.000Z');
      while (mondays.length < 48) {
        if (!isFifthWeekdayOfMonth(cursor)) {
          mondays.push(new Date(cursor));
        }
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }

      const planned = planRescheduleDates(
        mondays.filter((date) => date >= new Date('2026-10-01T00:00:00.000Z')),
        WEDNESDAY,
        new Date('2026-10-01T00:00:00.000Z'),
        isFifthWeekdayOfMonth,
      );

      const inMonth = (month: string) =>
        asIso(planned).filter((date) => date.startsWith(month));

      expect(inMonth('2026-12')).toEqual([
        '2026-12-02', '2026-12-09', '2026-12-16', '2026-12-23',
      ]);
      expect(inMonth('2027-06')).toEqual([
        '2027-06-02', '2027-06-09', '2027-06-16', '2027-06-23',
      ]);
    });

    /**
     * A month can be short because the OLD run lost a closure, and the
     * month-fill pass could not see it.
     *
     * That pass compared each month against what own-week anchoring said
     * belonged in it - the same figure the anchoring had just produced - so a
     * month legacy would have filled looked complete and was never repaired.
     * Found on 2026-09-02 in a dev smoke test.
     *
     * Sunday to Monday, effective 1 November 2026. The Sunday run loses
     * 29 November and 31 January, both fifth Sundays. By February 2027 only
     * three Mondays have a Sunday to map from, so February held three and
     * March five. Legacy gives both four.
     */
    it('fills a month whose source run lost a closure', () => {
      const sundays: Date[] = [];
      const cursor = new Date('2026-11-01T18:45:00.000Z');
      while (cursor <= new Date('2027-06-30T00:00:00.000Z')) {
        if (!isFifthWeekdayOfMonth(cursor)) {
          sundays.push(new Date(cursor));
        }
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }

      const planned = planRescheduleDates(
        sundays,
        MONDAY,
        new Date('2026-11-01T00:00:00.000Z'),
        isFifthWeekdayOfMonth,
      );

      const inMonth = (month: string) =>
        asIso(planned).filter((date) => date.startsWith(month));

      // Was three, with March taking five.
      expect(inMonth('2027-02')).toHaveLength(4);
      expect(inMonth('2027-03')).toHaveLength(4);
      expect(inMonth('2027-01')).toHaveLength(4);
    });

    /**
     * A closure is not the same as a cancellation.
     *
     * A lesson missing because the studio was CLOSED is not a hole - legacy
     * carries on counting and the month stays full. A lesson missing because it
     * was CANCELLED is a real hole, and the replacements after it must stay in
     * their own weeks. Telling the two apart is the whole of this fix, so both
     * directions are pinned here.
     */
    it('shifts after a closure but not after a cancellation', () => {
      const closure = planRescheduleDates(
        // 30 November is the fifth Monday - a closure, not a cancellation.
        days('2026-11-16', '2026-11-23', '2026-12-07', '2026-12-14'),
        WEDNESDAY,
        new Date('2026-11-01T00:00:00.000Z'),
        isFifthWeekdayOfMonth,
      );
      // December keeps its head slot: the closure does not cost a lesson.
      expect(asIso(closure)).toEqual([
        '2026-11-18', '2026-11-25', '2026-12-02', '2026-12-09',
      ]);

      const cancelled = planRescheduleDates(
        // The same shape, but the gap is an ordinary cancellation.
        days('2026-11-04', '2026-11-11', '2026-11-25', '2026-12-02'),
        WEDNESDAY,
        new Date('2026-11-01T00:00:00.000Z'),
        isFifthWeekdayOfMonth,
      );
      // Each keeps its own week; the hole is preserved.
      expect(asIso(cancelled)).toEqual([
        '2026-11-04', '2026-11-11', '2026-11-25', '2026-12-02',
      ]);
    });

    it('will not pull a month back past the day the change takes effect', () => {
      // The same move, but effective 7 December. December cannot be filled,
      // because 2 December is before the effective date. It stays short rather
      // than placing a lesson the student is not yet enrolled for.
      const planned = planRescheduleDates(
        oldMondays.filter((date) => date >= new Date('2026-12-07T00:00:00.000Z')),
        WEDNESDAY,
        new Date('2026-12-07T00:00:00.000Z'),
        isFifthWeekdayOfMonth,
      );

      expect(asIso(planned).every((date) => date >= '2026-12-07')).toBe(true);
      expect(asIso(planned).filter((d) => d.startsWith('2026-12'))).toEqual([
        '2026-12-09', '2026-12-16', '2026-12-23',
      ]);
    });
  });
});
