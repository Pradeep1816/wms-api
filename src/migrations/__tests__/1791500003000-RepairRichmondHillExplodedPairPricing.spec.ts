import { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { RepairRichmondHillExplodedPairPricing1791500003000 } from '../1791500003000-RepairRichmondHillExplodedPairPricing';

describe('RepairRichmondHillExplodedPairPricing1791500003000', () => {
  it('repairs the exploded pair total and safely restores the audited values', async () => {
    let backupCountCalls = 0;
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        backupCountCalls += 1;
        return [{ rowCount: backupCountCalls === 1 ? 0 : 2 }];
      }
      if (sql.includes('AS matchingCount')) {
        return [{ matchingCount: 2 }];
      }
      if (sql.includes('COUNT(*) AS invalidCount')) {
        return [{ invalidCount: 0 }];
      }
      if (sql.includes('SUM(pl.total) AS combinedTotal')) {
        return [
          {
            combinedTotal: '35.0000',
            combinedBalance: '35.0000',
            combinedDiscount: '1.2500',
          },
        ];
      }
      return { affectedRows: 2 };
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration = new RepairRichmondHillExplodedPairPricing1791500003000();

    await migration.up(queryRunner);
    await migration.down(queryRunner);

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).toContain('5429167 AS lessonId');
    expect(allSql).toContain('5429168 AS lessonId');
    expect(allSql).toContain('72.5200 AS newProgramRate');
    expect(allSql).toContain('72.4800 AS newProgramRate');
    expect(allSql).toContain('l.programRate = b.newProgramRate');
    expect(allSql).toContain('pl.total = b.newPrivateTotal');
    expect(allSql).toContain('l.programRate = b.oldProgramRate');
    expect(allSql).toContain('pl.total = b.oldPrivateTotal');
    expect(allSql).not.toMatch(/UPDATE\s+lesson_discount\b/i);
    expect(allSql).not.toMatch(/UPDATE\s+(payment|lesson_payment|invoice)\b/i);
    expect(allSql).not.toMatch(/INSERT INTO\s+(payment|lesson_payment)\b/i);
  });

  it('completes as a no-op when neither audited lesson matches', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 0 }];
      }
      if (sql.includes('AS matchingCount')) {
        return [{ matchingCount: 0 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration = new RepairRichmondHillExplodedPairPricing1791500003000();

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('UPDATE lesson l');
    expect(allSql).not.toContain('UPDATE private_lesson pl');
  });

  it('refuses to run when only one audited lesson matches', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 0 }];
      }
      if (sql.includes('AS matchingCount')) {
        return [{ matchingCount: 1 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration = new RepairRichmondHillExplodedPairPricing1791500003000();

    await expect(migration.up(queryRunner)).rejects.toThrow(
      'expected 2 matching baseline lessons, found 1',
    );

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('UPDATE lesson l');
    expect(allSql).not.toContain('UPDATE private_lesson pl');
  });

  it('is idempotent when both guarded pricing repairs already exist', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 2 }];
      }
      if (sql.includes('COUNT(*) AS invalidCount')) {
        return [{ invalidCount: 0 }];
      }
      if (sql.includes('SUM(pl.total) AS combinedTotal')) {
        return [
          {
            combinedTotal: '35.0000',
            combinedBalance: '35.0000',
            combinedDiscount: '1.2500',
          },
        ];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration = new RepairRichmondHillExplodedPairPricing1791500003000();

    await migration.up(queryRunner);

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('UPDATE lesson l');
    expect(allSql).not.toContain('UPDATE private_lesson pl');
  });

  it('refuses to continue from a partial backup', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 1 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration = new RepairRichmondHillExplodedPairPricing1791500003000();

    await expect(migration.up(queryRunner)).rejects.toThrow(
      'expected 2 backup rows, found 1',
    );
  });
});
