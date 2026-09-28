import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseRateResolverService } from './course-rate-resolver.service';
import { CourseProgramRate } from '../../course/entities/course-program-rate.entity';

function rate(
  id: number,
  startDate: string,
  endDate: string,
  programRate: number,
): CourseProgramRate {
  return {
    id,
    courseId: 1,
    startDate,
    endDate,
    programRate,
  } as unknown as CourseProgramRate;
}

describe('CourseRateResolverService', () => {
  let service: CourseRateResolverService;

  beforeEach(() => {
    service = new CourseRateResolverService();
    vi.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  describe('planNewCourseRateRows', () => {
    const CUT = '2026-09-01';

    it('splits a course that crosses the cutover into two periods', () => {
      expect(
        service.planNewCourseRateRows(
          '2026-08-04',
          '2026-10-31',
          65,
          CUT,
          72.5,
        ),
      ).toEqual([
        { startDate: '2026-08-04', endDate: '2026-08-31', programRate: 65 },
        { startDate: '2026-09-01', endDate: '2026-10-31', programRate: 72.5 },
      ]);
    });

    it('leaves a course ending before the cutover on one period', () => {
      expect(
        service.planNewCourseRateRows(
          '2026-06-01',
          '2026-08-31',
          65,
          CUT,
          72.5,
        ),
      ).toEqual([
        { startDate: '2026-06-01', endDate: '2026-08-31', programRate: 65 },
      ]);
    });

    it('prices a course starting on the cutover at the new rate throughout', () => {
      expect(
        service.planNewCourseRateRows(
          '2026-09-01',
          '2026-12-31',
          65,
          CUT,
          72.5,
        ),
      ).toEqual([
        { startDate: '2026-09-01', endDate: '2026-12-31', programRate: 72.5 },
      ]);
    });

    it('does not split when the catalogue has no answer', () => {
      // The gate that keeps every unclassified or untiered enrolment exactly as
      // it is today.
      expect(
        service.planNewCourseRateRows(
          '2026-08-04',
          '2026-10-31',
          65,
          CUT,
          null,
        ),
      ).toEqual([
        { startDate: '2026-08-04', endDate: '2026-10-31', programRate: 65 },
      ]);
    });

    it('does not split into two identical periods when the price is unchanged', () => {
      expect(
        service.planNewCourseRateRows('2026-08-04', '2026-10-31', 65, CUT, 65),
      ).toHaveLength(1);
    });

    it('covers the whole window with no gap and no overlap', () => {
      const rows = service.planNewCourseRateRows(
        '2026-08-04',
        '2026-10-31',
        65,
        CUT,
        72.5,
      );
      expect(rows[0].startDate).toBe('2026-08-04');
      expect(rows[rows.length - 1].endDate).toBe('2026-10-31');
      for (let i = 1; i < rows.length; i++) {
        const previousEnd = new Date(`${rows[i - 1].endDate}T00:00:00.000Z`);
        previousEnd.setUTCDate(previousEnd.getUTCDate() + 1);
        expect(rows[i].startDate).toBe(previousEnd.toISOString().slice(0, 10));
      }
    });

    it('returns nothing for an inverted window', () => {
      expect(
        service.planNewCourseRateRows(
          '2026-10-31',
          '2026-08-04',
          65,
          CUT,
          72.5,
        ),
      ).toEqual([]);
    });
  });

  describe('the auto-renewal scenario this was built for', () => {
    // Unit 5b changed auto-renewal from writing one flat row spanning the whole
    // renewal window to filling only the gaps. These pin the shape of the real
    // case rather than the abstract one, because the real case is what a future
    // change would break: a 25-month renewal window over a course that already
    // carries a September-dated period from migration staging.
    const CUTOVER = '2026-09-01';

    it('leaves a staged September period untouched and fills around it', () => {
      const staged = rate(900, CUTOVER, '2027-06-30', 72.5);
      const current = rate(800, '2025-07-01', '2026-08-31', 65);

      const planned = service.planRenewalRateRows(
        [current, staged],
        '2026-07-01',
        '2028-07-31',
        65,
      );

      // Nothing planned may overlap the staged period - that is the whole point.
      for (const row of planned) {
        const overlaps =
          row.startDate <= '2027-06-30' && row.endDate >= CUTOVER;
        expect(overlaps).toBe(false);
      }
      // And the window past it still gets priced.
      expect(planned.some((row) => row.startDate === '2027-07-01')).toBe(true);
    });

    it('carries the September rate forward past the staged period, not the old one', () => {
      // The failure this guards: filling the tail at program.rate would put the
      // customer back on 65.00 from July 2027, silently undoing the migration.
      const planned = service.planRenewalRateRows(
        [
          rate(800, '2025-07-01', '2026-08-31', 65),
          rate(900, CUTOVER, '2027-06-30', 72.5),
        ],
        '2026-07-01',
        '2028-07-31',
        65,
      );

      const tail = planned.find((row) => row.startDate === '2027-07-01');
      expect(tail?.programRate).toBe(72.5);
    });

    it('writes nothing when the window is already fully covered', () => {
      // A second renewal run over the same window must not duplicate periods.
      const planned = service.planRenewalRateRows(
        [rate(900, '2026-01-01', '2028-12-31', 72.5)],
        '2026-07-01',
        '2028-07-31',
        65,
      );

      expect(planned).toEqual([]);
    });

    it('falls back to the program rate only where nothing precedes the gap', () => {
      const planned = service.planRenewalRateRows(
        [],
        '2026-07-01',
        '2028-07-31',
        65,
      );

      expect(planned).toEqual([
        { startDate: '2026-07-01', endDate: '2028-07-31', programRate: 65 },
      ]);
    });
  });

  it('returns null when a course has no rate periods at all', () => {
    expect(service.selectRateForDate([], '2026-09-01')).toBeNull();
  });

  describe('the 1 September cutover - the case this exists for', () => {
    const rates = [
      rate(1, '2025-09-01', '2026-08-31', 65.0),
      rate(2, '2026-09-01', '2027-08-31', 72.5),
    ];

    it('gives an August lesson the OLD rate', () => {
      const resolved = service.selectRateForDate(rates, '2026-08-31');
      expect(resolved?.programRate).toBe(65.0);
      expect(resolved?.match).toBe('covering');
    });

    it('gives a September lesson the NEW rate', () => {
      const resolved = service.selectRateForDate(rates, '2026-09-01');
      expect(resolved?.programRate).toBe(72.5);
    });

    it('does not let the newest row leak backwards, which was the old bug', () => {
      // The previous implementation fetched the newest row and returned it
      // regardless of date, so this assertion is the regression guard.
      expect(service.selectRateForDate(rates, '2026-01-15')?.programRate).toBe(
        65.0,
      );
      expect(service.selectRateForDate(rates, '2026-06-30')?.programRate).toBe(
        65.0,
      );
    });
  });

  describe('dates no period covers - about 30% of future lessons', () => {
    it('carries the most recent past rate forward', () => {
      const rates = [
        rate(1, '2024-09-01', '2025-08-31', 57.5),
        rate(2, '2025-09-01', '2026-06-30', 65.0),
      ];

      const resolved = service.selectRateForDate(rates, '2026-11-01');
      expect(resolved?.programRate).toBe(65.0);
      expect(resolved?.match).toBe('carried_forward');
    });

    it('picks the most recent past period, not merely the newest row', () => {
      // Deliberately out of order, and with a later row that starts in the
      // future, to prove ordering is computed rather than assumed.
      const rates = [
        rate(3, '2027-01-01', '2027-12-31', 80.0),
        rate(1, '2024-09-01', '2025-08-31', 57.5),
        rate(2, '2025-09-01', '2026-06-30', 65.0),
      ];

      expect(service.selectRateForDate(rates, '2026-11-01')?.programRate).toBe(
        65.0,
      );
    });

    it('uses the earliest period when the date precedes all of them', () => {
      const rates = [
        rate(2, '2027-01-01', '2027-12-31', 80.0),
        rate(1, '2026-09-01', '2026-12-31', 72.5),
      ];

      const resolved = service.selectRateForDate(rates, '2026-01-01');
      expect(resolved?.programRate).toBe(72.5);
      expect(resolved?.match).toBe('earliest_future');
    });
  });

  describe('overlapping periods - 2,591 future lessons hit this', () => {
    it('is deterministic regardless of the order rows arrive in', () => {
      const a = rate(1, '2026-01-01', '2026-12-31', 65.0);
      const b = rate(2, '2026-06-01', '2026-12-31', 72.5);

      const forward = service.selectRateForDate([a, b], '2026-09-01');
      const reversed = service.selectRateForDate([b, a], '2026-09-01');

      expect(forward?.courseProgramRateId).toBe(reversed?.courseProgramRateId);
      // The most recently started period wins.
      expect(forward?.programRate).toBe(72.5);
      expect(forward?.ambiguous).toBe(true);
    });

    it('breaks a same-start tie on the highest id', () => {
      const a = rate(5, '2026-06-01', '2026-12-31', 65.0);
      const b = rate(9, '2026-06-01', '2026-12-31', 72.5);

      expect(
        service.selectRateForDate([a, b], '2026-09-01')?.courseProgramRateId,
      ).toBe(9);
    });

    it('does not flag a single match as ambiguous', () => {
      const resolved = service.selectRateForDate(
        [rate(1, '2026-01-01', '2026-12-31', 65.0)],
        '2026-09-01',
      );
      expect(resolved?.ambiguous).toBe(false);
    });
  });

  it('treats period boundaries as inclusive on both ends', () => {
    const rates = [rate(1, '2026-09-01', '2026-09-30', 72.5)];

    expect(service.selectRateForDate(rates, '2026-09-01')?.match).toBe(
      'covering',
    );
    expect(service.selectRateForDate(rates, '2026-09-30')?.match).toBe(
      'covering',
    );
    expect(service.selectRateForDate(rates, '2026-08-31')?.match).toBe(
      'earliest_future',
    );
    expect(service.selectRateForDate(rates, '2026-10-01')?.match).toBe(
      'carried_forward',
    );
  });

  it('accepts Date objects as well as date strings', () => {
    const rates = [
      {
        id: 1,
        courseId: 1,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-08-31T00:00:00.000Z'),
        programRate: 72.5,
      } as unknown as CourseProgramRate,
    ];

    expect(service.selectRateForDate(rates, '2026-09-15')?.match).toBe(
      'covering',
    );
  });
});

describe('planRenewalRateRows', () => {
  let service: CourseRateResolverService;

  beforeEach(() => {
    service = new CourseRateResolverService();
  });

  it('covers the whole window with one row when nothing exists yet', () => {
    const planned = service.planRenewalRateRows(
      [],
      '2026-09-01',
      '2028-09-30',
      65,
    );

    expect(planned).toEqual([
      { startDate: '2026-09-01', endDate: '2028-09-30', programRate: 65 },
    ]);
  });

  // Grandfathering, added 2026-08-18. A held enrolment carries ONE rate row at
  // the previous rate, and renewal must extend that rather than reach for the
  // September catalogue - otherwise the concession quietly expires at the next
  // renewal, which is one of the reasons the discount approach was rejected.
  it('carries a held rate forward, so grandfathering survives renewal', () => {
    const existing = [rate(1, '2026-08-24', '2026-10-31', 65)];

    const planned = service.planRenewalRateRows(
      existing,
      '2026-11-01',
      '2028-11-30',
      65,
    );

    expect(planned).toEqual([
      { startDate: '2026-11-01', endDate: '2028-11-30', programRate: 65 },
    ]);
  });

  // The mirror of the above: a tiered enrolment must carry the September rate
  // forward, not fall back to program.rate, or renewal would silently undo the
  // increase.
  it('carries the September rate forward for a tiered course', () => {
    const existing = [
      rate(1, '2026-08-24', '2026-08-31', 65),
      rate(2, '2026-09-01', '2026-10-31', 87.5),
    ];

    const planned = service.planRenewalRateRows(
      existing,
      '2026-11-01',
      '2028-11-30',
      65,
    );

    expect(planned).toEqual([
      { startDate: '2026-11-01', endDate: '2028-11-30', programRate: 87.5 },
    ]);
  });

  it('leaves a future September period alone and fills around it', () => {
    // This is the case the whole change exists for. The migration writes the
    // September period; auto-renewal must not paper over it with a 25-month
    // row at the old rate.
    const existing = [rate(1, '2026-09-01', '2027-08-31', 72.5)];

    const planned = service.planRenewalRateRows(
      existing,
      '2026-07-01',
      '2028-06-30',
      65,
    );

    expect(planned).toEqual([
      { startDate: '2026-07-01', endDate: '2026-08-31', programRate: 65 },
      { startDate: '2027-09-01', endDate: '2028-06-30', programRate: 72.5 },
    ]);
  });

  it('carries the preceding rate into a gap rather than the fallback', () => {
    const existing = [
      rate(1, '2025-09-01', '2026-08-31', 65),
      rate(2, '2026-09-01', '2027-08-31', 72.5),
    ];

    const planned = service.planRenewalRateRows(
      existing,
      '2027-09-01',
      '2028-08-31',
      999,
    );

    expect(planned).toEqual([
      { startDate: '2027-09-01', endDate: '2028-08-31', programRate: 72.5 },
    ]);
  });

  it('returns nothing when the window is already fully covered', () => {
    const existing = [rate(1, '2026-01-01', '2028-12-31', 65)];

    expect(
      service.planRenewalRateRows(existing, '2026-09-01', '2027-09-01', 65),
    ).toEqual([]);
  });

  it('fills gaps between two existing periods', () => {
    const existing = [
      rate(1, '2026-09-01', '2026-12-31', 72.5),
      rate(2, '2027-06-01', '2027-12-31', 80),
    ];

    const planned = service.planRenewalRateRows(
      existing,
      '2026-09-01',
      '2027-12-31',
      65,
    );

    expect(planned).toEqual([
      { startDate: '2027-01-01', endDate: '2027-05-31', programRate: 72.5 },
    ]);
  });

  it('ignores periods entirely outside the window', () => {
    const existing = [rate(1, '2020-01-01', '2020-12-31', 57.5)];

    const planned = service.planRenewalRateRows(
      existing,
      '2026-09-01',
      '2027-08-31',
      65,
    );

    expect(planned).toEqual([
      { startDate: '2026-09-01', endDate: '2027-08-31', programRate: 57.5 },
    ]);
  });

  it('returns nothing for an inverted window', () => {
    expect(
      service.planRenewalRateRows([], '2027-01-01', '2026-01-01', 65),
    ).toEqual([]);
  });

  it('produces rows that leave no day of the window unpriced', () => {
    const existing = [rate(1, '2026-09-01', '2026-09-30', 72.5)];
    const planned = service.planRenewalRateRows(
      existing,
      '2026-08-01',
      '2026-11-30',
      65,
    );
    const all = [
      ...planned.map((p) => ({ start: p.startDate, end: p.endDate })),
      { start: '2026-09-01', end: '2026-09-30' },
    ].sort((a, b) => a.start.localeCompare(b.start));

    expect(all[0].start).toBe('2026-08-01');
    expect(all[all.length - 1].end).toBe('2026-11-30');
    for (let i = 1; i < all.length; i += 1) {
      const previousEnd = new Date(`${all[i - 1].end}T00:00:00.000Z`);
      previousEnd.setUTCDate(previousEnd.getUTCDate() + 1);
      expect(all[i].start).toBe(previousEnd.toISOString().slice(0, 10));
    }
  });
});
