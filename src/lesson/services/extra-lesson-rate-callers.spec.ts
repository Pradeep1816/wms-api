import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Both doors into an extra course must price through `ExtraLessonRateService`.
 *
 * There are two: adding a private lesson, and converting a group lesson to a
 * private one. The fix of 2026-09-02 went through the first and left the second
 * on the old `program.rate` fallback, which was found the same day only because
 * something unrelated was being checked.
 *
 * A behavioural test would not have caught that - the second door simply never
 * called the corrected code. This asserts on the source instead, which is the
 * thing that was actually wrong.
 */
describe('every extra-lesson path prices through ExtraLessonRateService', () => {
  const read = (file: string) =>
    readFileSync(join(__dirname, file), 'utf8');

  const DOORS = [
    'private-lesson-create.service.ts',
    'lesson-change.service.ts',
  ];

  it.each(DOORS)('%s delegates to the service', (file) => {
    const source = read(file);
    expect(source).toContain('extraLessonRate.resolveAndRecord');
    expect(source).toContain(
      'extraLessonRate.applyEnrolmentDiscounts',
    );
  });

  it.each(DOORS)('%s no longer falls back to the program list price', (file) => {
    const source = read(file);
    // `getProgramRateFromProgram` is the pre-tier list price. Only the service
    // may reach for it, and only as a last resort.
    expect(source).not.toContain('getProgramRateFromProgram');
  });

  it('the service is the single place that rule lives', () => {
    const service = read('extra-lesson-rate.service.ts');
    expect(service).toContain('getProgramRateFromProgram');
    expect(service).toContain('findRegularEnrolmentForPricing');
  });
});
