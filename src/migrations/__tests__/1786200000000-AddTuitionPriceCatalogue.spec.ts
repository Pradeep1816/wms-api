import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getMetadataArgsStorage } from 'typeorm';
import { TuitionPrice } from '../../pricing/entities/tuition-price.entity';
import { TuitionPrepaidPrice } from '../../pricing/entities/tuition-prepaid-price.entity';

/**
 * Does the migration create every column the entity reads?
 *
 * ## Why this exists
 *
 * Found on 2026-08-17 by running the migration against a real snapshot rather
 * than a mock: `TuitionPrice` declared `priceBook` and the repository filtered
 * on it, but the column was created by `1786600000000-AddLegacyPriceBook` -
 * a migration deliberately left out of this scope, because the legacy price
 * books exist only to serve the paused conversion.
 *
 * The seed still inserted 18 and 54 rows, because the INSERT never named the
 * missing column. Every unit test still passed, because they all mock the
 * repository. The first thing to fail would have been a member of staff opening
 * the enrolment screen: `Unknown column 'priceBook' in 'field list'`.
 *
 * So this reads the migration's SQL as text and checks the columns against the
 * entity metadata. Crude, and it does not check types - but it fails on the one
 * mistake that unit tests structurally cannot see.
 *
 * ## Why it lives in a subfolder
 *
 * It sat in `src/migrations/` until 2026-08-18, where the data source's glob
 * `migrations/*{.ts,.js}` picked it up as a migration and tried to require it.
 * Importing vitest from a CommonJS require throws, so `migration:run` failed
 * outright - a spec written to protect a deployment was stopping one. The glob
 * does not cross a directory separator, so a subfolder is out of its reach.
 */
const migrationSql = readFileSync(
  join(
    process.cwd(),
    'src/migrations/1786200000000-AddTuitionPriceCatalogue.ts',
  ),
  'utf8',
);

/** Column names TypeORM will put in a SELECT for this entity. */
function columnNamesOf(target: unknown): string[] {
  return getMetadataArgsStorage()
    .filterColumns(target as never)
    .map((column) => column.options?.name ?? column.propertyName);
}

describe('AddTuitionPriceCatalogue', () => {
  it.each([
    ['tuition_price', TuitionPrice],
    ['tuition_prepaid_price', TuitionPrepaidPrice],
  ])('creates every column %s reads', (table, entity) => {
    const columns = columnNamesOf(entity);
    expect(columns.length).toBeGreaterThan(5);

    const missing = columns.filter(
      // String.raw, because `\b` inside an ordinary template literal is a
      // backspace character rather than a word boundary - which makes the
      // pattern match nothing and the guard silently pass everything.
      (column) => !new RegExp(String.raw`\b` + column + String.raw`\b`).test(migrationSql),
    );

    expect(missing, `${table} columns absent from the migration`).toEqual([]);
  });

  it('files the catalogue under the September price book', () => {
    // Not just any default: the repository filters on this exact value, so a
    // mismatch returns no rows and the resolver reads it as "no catalogue
    // answer" - which silently leaves every enrolment on its old rate.
    expect(migrationSql).toContain("priceBook varchar(40) NOT NULL DEFAULT '");
    expect(migrationSql).toContain('SEPTEMBER_2026_PRICE_BOOK');
  });

  it('keys uniqueness on the price book as well as the scope', () => {
    // Without priceBook in the key, a second price book cannot hold a row for
    // the same category, tier, duration and date - which is precisely what a
    // second price book is for.
    const uniqueKey = /UNIQUE KEY UQ_tuition_price_scope \(([^)]*)\)/.exec(
      migrationSql,
    );
    expect(uniqueKey?.[1]).toContain('priceBook');
  });

  it('drops both tables on the way down, child first', () => {
    const prepaid = migrationSql.indexOf(
      'DROP TABLE IF EXISTS tuition_prepaid_price',
    );
    const parent = migrationSql.indexOf('DROP TABLE IF EXISTS tuition_price');

    expect(prepaid).toBeGreaterThan(-1);
    // The child carries the foreign key, so dropping the parent first fails.
    expect(prepaid).toBeLessThan(parent);
  });
});
