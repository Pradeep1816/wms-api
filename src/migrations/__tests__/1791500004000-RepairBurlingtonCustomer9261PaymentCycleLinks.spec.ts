import { describe, expect, it, vi } from 'vitest';
import { QueryRunner } from 'typeorm';
import { RepairBurlingtonCustomer9261PaymentCycleLinks1791500004000 } from '../1791500004000-RepairBurlingtonCustomer9261PaymentCycleLinks';

describe('RepairBurlingtonCustomer9261PaymentCycleLinks1791500004000', () => {
  it('relinks transferred lessons, deduplicates historical links, and rolls back', async () => {
    let backupCountCalls = 0;
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        backupCountCalls += 1;
        return [{ rowCount: backupCountCalls === 1 ? 0 : 6 }];
      }
      if (sql.includes('AS matchingCrossCount')) {
        return [{ matchingCrossCount: 3 }];
      }
      if (sql.includes('AS matchingDuplicateCount')) {
        return [{ matchingDuplicateCount: 3 }];
      }
      if (sql.includes('COUNT(*) AS invalidCount')) {
        return [{ invalidCount: 0 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairBurlingtonCustomer9261PaymentCycleLinks1791500004000();

    await migration.up(queryRunner);
    await migration.down(queryRunner);

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).toContain('pcl.paymentCycleId = b.newPaymentCycleId');
    expect(allSql).toContain('pcl.isDeleted = b.newIsDeleted');
    expect(allSql).toContain('pcl.paymentCycleId = b.oldPaymentCycleId');
    expect(allSql).toContain('pcl.isDeleted = b.oldIsDeleted');
    expect(allSql).toContain('5400714 AS lessonId');
    expect(allSql).toContain('759054 AS expectedPaymentCycleId');
    expect(allSql).toContain('2923110 AS paymentCycleLessonId');
    expect(allSql).toContain('3098269 AS paymentCycleLessonId');
    expect(allSql).not.toMatch(/UPDATE\s+(lesson|private_lesson)\b/i);
    expect(allSql).not.toMatch(/UPDATE\s+(payment|lesson_payment)\b/i);
    expect(allSql).not.toMatch(/UPDATE\s+invoice\b/i);
    expect(allSql).not.toMatch(/UPDATE\s+customer_recurring_payment\b/i);
  });

  it('is a no-op when none of the audited records match', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 0 }];
      }
      if (sql.includes('AS matchingCrossCount')) {
        return [{ matchingCrossCount: 0 }];
      }
      if (sql.includes('AS matchingDuplicateCount')) {
        return [{ matchingDuplicateCount: 0 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairBurlingtonCustomer9261PaymentCycleLinks1791500004000();

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('pcl.paymentCycleId = b.newPaymentCycleId');
    expect(allSql).not.toContain('INSERT INTO `migration_burlington');
  });

  it('skips the entire repair when the audited graph only partially matches', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 0 }];
      }
      if (sql.includes('AS matchingCrossCount')) {
        return [{ matchingCrossCount: 3 }];
      }
      if (sql.includes('AS matchingDuplicateCount')) {
        return [{ matchingDuplicateCount: 2 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairBurlingtonCustomer9261PaymentCycleLinks1791500004000();

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('INSERT INTO `migration_burlington');
    expect(allSql).not.toContain('pcl.paymentCycleId = b.newPaymentCycleId');
  });

  it('skips when duplicate targets match but cross-month targets are unrecognized', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 0 }];
      }
      if (sql.includes('AS matchingCrossCount')) {
        return [{ matchingCrossCount: 0 }];
      }
      if (sql.includes('AS matchingDuplicateCount')) {
        return [{ matchingDuplicateCount: 3 }];
      }
      if (sql.includes('AS matchingCrossFinalCount')) {
        return [{ matchingCrossFinalCount: 0 }];
      }
      if (sql.includes('AS matchingDuplicateFinalCount')) {
        return [{ matchingDuplicateFinalCount: 0 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairBurlingtonCustomer9261PaymentCycleLinks1791500004000();

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('INSERT INTO `migration_burlington');
    expect(allSql).not.toContain('pcl.paymentCycleId = b.newPaymentCycleId');
  });

  it('repairs pending rows when the remaining audited rows are already final', async () => {
    let backupCountCalls = 0;
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        backupCountCalls += 1;
        return [{ rowCount: backupCountCalls === 1 ? 0 : 3 }];
      }
      if (sql.includes('AS matchingCrossCount')) {
        return [{ matchingCrossCount: 1 }];
      }
      if (sql.includes('AS matchingDuplicateCount')) {
        return [{ matchingDuplicateCount: 2 }];
      }
      if (sql.includes('AS matchingCrossFinalCount')) {
        return [{ matchingCrossFinalCount: 2 }];
      }
      if (sql.includes('AS matchingDuplicateFinalCount')) {
        return [{ matchingDuplicateFinalCount: 1 }];
      }
      if (sql.includes('COUNT(*) AS invalidCount')) {
        return [{ invalidCount: 0 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairBurlingtonCustomer9261PaymentCycleLinks1791500004000();

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).toContain('INSERT INTO `migration_burlington');
    expect(allSql).toContain('pcl.paymentCycleId = b.newPaymentCycleId');
    expect(allSql).toContain('duplicatePcl.isDeleted = 0');
  });

  it('is a no-op when every audited row is already final', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 0 }];
      }
      if (sql.includes('AS matchingCrossCount')) {
        return [{ matchingCrossCount: 0 }];
      }
      if (sql.includes('AS matchingDuplicateCount')) {
        return [{ matchingDuplicateCount: 0 }];
      }
      if (sql.includes('AS matchingCrossFinalCount')) {
        return [{ matchingCrossFinalCount: 3 }];
      }
      if (sql.includes('AS matchingDuplicateFinalCount')) {
        return [{ matchingDuplicateFinalCount: 3 }];
      }
      if (sql.includes('COUNT(*) AS invalidCount')) {
        return [{ invalidCount: 0 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairBurlingtonCustomer9261PaymentCycleLinks1791500004000();

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('INSERT INTO `migration_burlington');
    expect(allSql).not.toContain('pcl.paymentCycleId = b.newPaymentCycleId');
  });

  it('validates and exits when the guarded repair is already recorded', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 6 }];
      }
      if (sql.includes('COUNT(*) AS invalidCount')) {
        return [{ invalidCount: 0 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairBurlingtonCustomer9261PaymentCycleLinks1791500004000();

    await migration.up(queryRunner);

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('AS matchingCrossCount');
    expect(allSql).not.toContain('pcl.paymentCycleId = b.newPaymentCycleId');
  });

  it('validates and exits when a partial repair backup is already recorded', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 4 }];
      }
      if (sql.includes('COUNT(*) AS invalidCount')) {
        return [{ invalidCount: 0 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairBurlingtonCustomer9261PaymentCycleLinks1791500004000();

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('AS matchingCrossCount');
    expect(allSql).not.toContain('pcl.paymentCycleId = b.newPaymentCycleId');
  });

  it('refuses rollback when repaired state has drifted', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 6 }];
      }
      if (sql.includes('COUNT(*) AS invalidCount')) {
        return [{ invalidCount: 1 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairBurlingtonCustomer9261PaymentCycleLinks1791500004000();

    await expect(migration.down(queryRunner)).rejects.toThrow(
      'repaired links failed final validation',
    );

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('pcl.paymentCycleId = b.oldPaymentCycleId');
  });
});
