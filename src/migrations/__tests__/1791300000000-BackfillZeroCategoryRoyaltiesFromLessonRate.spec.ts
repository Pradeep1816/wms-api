import { describe, expect, it, vi } from 'vitest';
import { QueryRunner } from 'typeorm';
import { BackfillZeroCategoryRoyaltiesFromLessonRate1791300000000 } from '../1791300000000-BackfillZeroCategoryRoyaltiesFromLessonRate';

describe('BackfillZeroCategoryRoyaltiesFromLessonRate1791300000000', () => {
  it('uses each active location lesson rate for missing and zero category rates', async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new BackfillZeroCategoryRoyaltiesFromLessonRate1791300000000();

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledTimes(2);
    const insertSql = String(query.mock.calls[0][0]);
    const updateSql = String(query.mock.calls[1][0]);

    expect(insertSql).toContain('lessonRoyalty.value');
    expect(insertSql).toContain('lessonRoyalty.locationId = location.id');
    expect(insertSql).toContain('lessonRoyalty.type = 1');
    expect(insertSql).toContain('location.isDeleted = 0');
    expect(insertSql).toContain('category.isDeleted = 0');
    expect(insertSql).toContain('category.id NOT IN (1, 4)');
    expect(insertSql).toContain('NOT EXISTS');

    expect(updateSql).toContain(
      'SET locationRate.royality = lessonRoyalty.value',
    );
    expect(updateSql).toContain('WHERE locationRate.royality = 0');
    expect(updateSql).toContain('location.isDeleted = 0');
    expect(updateSql).toContain('category.isDeleted = 0');
    expect(updateSql).toContain('category.id NOT IN (1, 4)');

    expect(`${insertSql}\n${updateSql}`).not.toContain('6.00');
  });

  it('does not attempt a destructive rollback', async () => {
    const query = vi.fn();
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new BackfillZeroCategoryRoyaltiesFromLessonRate1791300000000();

    await migration.down(queryRunner);

    expect(query).not.toHaveBeenCalled();
  });
});
