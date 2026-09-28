import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Nothing but migrations may sit directly in `src/migrations/`.
 *
 * ## The failure this exists for
 *
 * The data source loads migrations with the glob
 * `src/migrations/*{.ts,.js}` and `require`s everything it matches. On
 * 2026-08-17 a guard spec was added to that folder; it imports vitest, vitest
 * refuses to be loaded from a CommonJS `require`, and so `yarn migration:run`
 * failed before running a single migration:
 *
 * ```
 * Error: Vitest cannot be imported in a CommonJS module using require().
 *   at src/migrations/1786200000000-AddTuitionPriceCatalogue.spec.ts:3:1
 * ```
 *
 * Every unit test passed throughout, because the suite never loads the data
 * source. The first thing to fail would have been the deployment - and this
 * release is one where the migrations *must* run before the code, or every
 * `program` query dies on a missing column. A test file would have taken the
 * schema change down with it.
 *
 * The glob does not cross a directory separator, so specs live in this
 * subfolder and are invisible to it. This test is what keeps them there.
 */
describe('the migrations folder', () => {
  const migrationsDir = join(process.cwd(), 'src/migrations');

  const entries = readdirSync(migrationsDir, { withFileTypes: true });

  it('holds no test files, which the data source would try to run', () => {
    const offenders = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => /\.(spec|test)\.[jt]s$/.test(name));

    expect(offenders).toEqual([]);
  });

  // A weaker version of the same rule, and the one that would catch a helper
  // or a fixture rather than a spec. Anything here is required as a migration,
  // so anything here has to be one.
  it('holds only files named as timestamped migrations', () => {
    const offenders = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => !/^\d{13,}-[A-Za-z0-9]+\.ts$/.test(name));

    expect(offenders).toEqual([]);
  });

  it('is not empty, so the checks above are not passing vacuously', () => {
    expect(entries.filter((entry) => entry.isFile()).length).toBeGreaterThan(0);
  });
});
