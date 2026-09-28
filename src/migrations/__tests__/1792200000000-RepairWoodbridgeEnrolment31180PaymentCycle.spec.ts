import { describe, expect, it, vi } from 'vitest';
import { QueryRunner } from 'typeorm';
import { RepairWoodbridgeEnrolment31180PaymentCycle1792200000000 } from '../1792200000000-RepairWoodbridgeEnrolment31180PaymentCycle';

describe('RepairWoodbridgeEnrolment31180PaymentCycle1792200000000', () => {
  it('splits the monthly cycles, repairs lesson links and due dates, and can roll back', async () => {
    let backupCountCalls = 0;
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        backupCountCalls += 1;
        return [{ rowCount: backupCountCalls === 1 ? 0 : 5 }];
      }
      if (sql.includes('AS matchingCount')) {
        return [{ matchingCount: 5 }];
      }
      if (sql.includes('COUNT(*) AS invalidCount')) {
        return [{ invalidCount: 0 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairWoodbridgeEnrolment31180PaymentCycle1792200000000();

    await migration.up(queryRunner);
    await migration.down(queryRunner);

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).toContain('SET pcl.paymentCycleId = b.newPaymentCycleId');
    expect(allSql).toContain('l.dueDate = b.newDueDate');
    expect(allSql).toContain(
      'epf.paymentCycleStartDate = b.newFrequencyStartDate',
    );
    expect(allSql).toContain('pc.endDate = b.newOctoberCycleEndDate');
    expect(allSql).toContain('pc.isDeleted = b.newNovemberCycleIsDeleted');
    expect(allSql).toContain('SET pcl.paymentCycleId = b.oldPaymentCycleId');
    expect(allSql).toContain('l.dueDate = b.oldDueDate');
    expect(allSql).toContain('4912328 AS lessonId');
    expect(allSql).toContain('5462390 AS lessonId');
    expect(allSql).not.toMatch(/UPDATE\s+(payment|lesson_payment)\b/i);
    expect(allSql).not.toMatch(/UPDATE\s+private_lesson\b/i);
    expect(allSql).not.toMatch(/UPDATE\s+invoice\b/i);
    expect(allSql).not.toMatch(/UPDATE\s+customer_recurring_payment\b/i);
  });

  it('is a no-op when the production-specific record is absent', async () => {
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
    const migration =
      new RepairWoodbridgeEnrolment31180PaymentCycle1792200000000();

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('INSERT INTO `migration_woodbridge');
    expect(allSql).not.toContain('pcl.paymentCycleId = b.newPaymentCycleId');
    expect(allSql).not.toContain('l.dueDate = b.newDueDate');
  });

  it('is a no-op when the target is already repaired', async () => {
    let stateMatchCalls = 0;
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 0 }];
      }
      if (sql.includes('AS matchingCount')) {
        stateMatchCalls += 1;
        return [{ matchingCount: stateMatchCalls === 1 ? 0 : 5 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairWoodbridgeEnrolment31180PaymentCycle1792200000000();

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('INSERT INTO `migration_woodbridge');
    expect(allSql).not.toContain('pcl.paymentCycleId = b.newPaymentCycleId');
  });

  it('does not partially repair an incomplete audited graph', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 0 }];
      }
      if (sql.includes('AS matchingCount')) {
        return [{ matchingCount: 4 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairWoodbridgeEnrolment31180PaymentCycle1792200000000();

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('INSERT INTO `migration_woodbridge');
    expect(allSql).not.toContain('pcl.paymentCycleId = b.newPaymentCycleId');
    expect(allSql).not.toContain(
      'epf.paymentCycleStartDate = b.newFrequencyStartDate',
    );
  });

  it('refuses rollback after the repaired state has drifted', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 5 }];
      }
      if (sql.includes('COUNT(*) AS invalidCount')) {
        return [{ invalidCount: 1 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairWoodbridgeEnrolment31180PaymentCycle1792200000000();

    await expect(migration.down(queryRunner)).rejects.toThrow(
      'repaired state validation failed',
    );

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('pcl.paymentCycleId = b.oldPaymentCycleId');
  });

  it('allows reverting the earlier lesson-only version without a new backup', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 0 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairWoodbridgeEnrolment31180PaymentCycle1792200000000();

    await expect(migration.down(queryRunner)).resolves.toBeUndefined();

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).toContain(
      'CREATE TABLE IF NOT EXISTS `migration_woodbridge_31180_monthly_cycle_backup`',
    );
    expect(allSql).not.toContain('SET pcl.paymentCycleId');
  });
});
