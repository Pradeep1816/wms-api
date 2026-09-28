import { describe, expect, it, vi } from 'vitest';
import { RestoreCourse15895PricingMetadata1788955200000 as Repair } from '../1788955200000-RestoreCourse15895PricingMetadata';

const fixture = () => ({
  course: [
    {
      id: 15895,
      locationId: 16,
      programId: 68,
      type: 1,
      isDeleted: 0,
      startDate: '0000-00-00 00:00:00',
      endDate: '2028-01-22 11:00:00',
    },
  ],
  enrolment: [
    {
      id: 16085,
      courseId: 15895,
      studentId: 14389,
      isDeleted: 0,
      isConfirmed: 1,
      pricingTier: 1,
      keepsPreviousRate: 0,
    },
  ],
  student: [{ customer_id: 9404 }],
  location: [{ slug: 'richmond-hill' }],
  program: [{ name: 'Drums Contemporary', pricingCategory: 'standard' }],
  bounds: [
    { firstDate: '2022-01-24 16:00:00', lastDate: '2028-01-27 15:30:00' },
  ],
  backup: [{ newStartDate: '2022-01-24 16:00:00' }],
  history: [{ id: 232, newTier: 1, effectiveFrom: '2026-09-01' }],
  catalog: [{ hourlyRate: '72.50' }],
  rates: [] as any[],
});
describe('course 15895 metadata repair safeguards', () => {
  it('leaves older dumps without a September tier decision unchanged, but does not hide a changed decision', () => {
    const s: any = fixture();
    s.enrolment[0].pricingTier = null;
    s.history = [];
    expect(Repair.predatesDecision(s)).toBe(true);
    s.history = [{ id: 232, newTier: 1, effectiveFrom: '2026-09-01' }];
    expect(Repair.predatesDecision(s)).toBe(false);
    s.history = [];
    s.enrolment[0].pricingTier = 2;
    expect(Repair.predatesDecision(s)).toBe(false);
  });
  it('restores only the evidenced start and two periods, retaining the actual course end despite later draft lessons', () => {
    const p = Repair.plan(fixture());
    expect(p.newStart).toBe('2022-01-24 16:00:00');
    expect(p.endDate).toBe('2028-01-22 11:00:00');
    expect(p.insertPeriods).toEqual([
      {
        startDate: '2022-01-24',
        endDate: '2026-08-31',
        programRate: 65,
        applyFullDiscount: 0,
      },
      {
        startDate: '2026-09-01',
        endDate: '2028-01-22',
        programRate: 72.5,
        applyFullDiscount: 0,
      },
    ]);
  });
  it('is idempotent after the repair and resumes a partial period insertion', () => {
    const s = fixture();
    const periods = Repair.plan(s).insertPeriods;
    s.rates = [{ ...periods[0], id: 1 }];
    expect(Repair.plan(s).insertPeriods).toEqual([periods[1]]);
    s.rates.push({ ...periods[1], id: 2 });
    s.course[0].startDate = '2022-01-24 16:00:00';
    expect(Repair.plan(s).noOp).toBe(true);
  });
  it.each([
    ['identity', (s: any) => (s.enrolment[0].studentId = 999)],
    ['customer', (s: any) => (s.student[0].customer_id = 999)],
    ['tier', (s: any) => (s.enrolment[0].pricingTier = 2)],
    [
      'previous-rate decision',
      (s: any) => (s.enrolment[0].keepsPreviousRate = 1),
    ],
    ['end date', (s: any) => (s.course[0].endDate = '2029-01-01 11:00:00')],
    ['start date', (s: any) => (s.course[0].startDate = '2022-01-25 16:00:00')],
    ['date evidence', (s: any) => (s.backup = [])],
    [
      'valid earliest lesson',
      (s: any) => (s.bounds[0].firstDate = '2022-01-25 16:00:00'),
    ],
    ['newer pricing decision', (s: any) => (s.history[0].id = 233)],
    ['published price', (s: any) => (s.catalog[0].hourlyRate = '75.00')],
    [
      'existing conflicting rate',
      (s: any) =>
        (s.rates = [
          {
            startDate: '2022-01-24',
            endDate: '2028-01-22',
            programRate: 65,
            applyFullDiscount: 0,
          },
        ]),
    ],
    [
      'duplicate rate',
      (s: any) => {
        const p = Repair.plan(s).insertPeriods[0];
        s.rates = [
          { ...p, id: 1 },
          { ...p, id: 2 },
        ];
      },
    ],
  ])('refuses changed %s before mutation', (_name, change) => {
    const s = fixture();
    (change as (s: any) => void)(s);
    expect(() => Repair.plan(s)).toThrow(/repair refused/);
  });
  it('does not create a backup or mutate an installation without the historical course', async () => {
    const query = vi.fn().mockResolvedValue([]);
    await new Repair().up({ query } as any);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatch(/^SELECT/);
  });
  it('refuses rollback of an interrupted application without a verified after snapshot', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ present: 1 }])
      .mockResolvedValueOnce([
        { snapshot: JSON.stringify(fixture()), afterSnapshot: null },
      ]);
    await expect(new Repair().down({ query } as any)).rejects.toThrow(
      /interrupted/,
    );
    expect(
      query.mock.calls.every((call) => String(call[0]).startsWith('SELECT')),
    ).toBe(true);
  });
  it('refuses rollback when financial data changed before any DELETE or UPDATE', async () => {
    const old = { ...fixture(), lessons: [{ id: 1, total: '32.50' }] };
    const current = { ...old, lessons: [{ id: 1, total: '36.25' }] };
    const after = {
      ...old,
      course: [{ ...old.course[0], startDate: '2022-01-24 16:00:00' }],
      rates: Repair.plan(old).insertPeriods,
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('information_schema.TABLES')) return [{ present: 1 }];
      if (sql.includes('SELECT snapshot,afterSnapshot'))
        return [
          {
            snapshot: JSON.stringify(old),
            afterSnapshot: JSON.stringify(after),
          },
        ];
      if (sql.startsWith('SELECT * FROM lesson WHERE')) return current.lessons;
      return [];
    });
    await expect(new Repair().down({ query } as any)).rejects.toThrow(
      /Financial data changed/,
    );
    expect(query.mock.calls.every((call) => call[0].startsWith('SELECT'))).toBe(
      true,
    );
  });
});
