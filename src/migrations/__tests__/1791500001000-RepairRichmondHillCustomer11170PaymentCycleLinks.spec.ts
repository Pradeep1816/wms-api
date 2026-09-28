import { describe, expect, it, vi } from 'vitest';
import { QueryRunner } from 'typeorm';
import { RepairRichmondHillCustomer11170PaymentCycleLinks1791500001000 } from '../1791500001000-RepairRichmondHillCustomer11170PaymentCycleLinks';

const targetEnrolments = [
  {
    enrolmentId: 21420,
    customerId: 11170,
    locationId: 16,
    paymentFrequencyId: 1,
    isDeleted: 0,
    isConfirmed: 1,
  },
  {
    enrolmentId: 21536,
    customerId: 11170,
    locationId: 16,
    paymentFrequencyId: 1,
    isDeleted: 0,
    isConfirmed: 1,
  },
];

describe('RepairRichmondHillCustomer11170PaymentCycleLinks1791500001000', () => {
  it('relinks guarded lessons, preserves financial rows, and rolls back', async () => {
    let backupCountCalls = 0;
    let staleCountCalls = 0;
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        backupCountCalls += 1;
        return [{ rowCount: backupCountCalls === 1 ? 0 : 22 }];
      }
      if (sql.includes('e.id AS enrolmentId')) {
        return targetEnrolments;
      }
      if (sql.includes('COUNT(*) AS auditedCount')) {
        return [{ auditedCount: 22, matchingCount: 22 }];
      }
      if (sql.includes('COUNT(DISTINCT stale.lessonId) AS staleCount')) {
        staleCountCalls += 1;
        return [{ staleCount: staleCountCalls === 1 ? 22 : 0 }];
      }
      if (sql.includes('COUNT(*) AS invalidCount')) {
        return [{ invalidCount: 0 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairRichmondHillCustomer11170PaymentCycleLinks1791500001000();

    await migration.up(queryRunner);
    await migration.down(queryRunner);

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).toContain('SET pcl.isDeleted = 1');
    expect(allSql).toContain('SET pcl.isDeleted = 0');
    expect(allSql).toContain('l.dueDate = b.newDueDate');
    expect(allSql).toContain('l.dueDate = b.oldLessonDueDate');
    expect(allSql).toContain(
      '5327590 AS lessonId, 21536 AS enrolmentId, 769760 AS currentPaymentCycleId, 577703 AS expectedPaymentCycleId',
    );
    expect(allSql).toContain(
      '5429168 AS lessonId, 21536 AS enrolmentId, 769762 AS currentPaymentCycleId, 769761 AS expectedPaymentCycleId',
    );
    expect(allSql).not.toMatch(
      /UPDATE\s+(private_lesson|lesson_payment|payment)\b/i,
    );
    expect(allSql).not.toMatch(/UPDATE\s+customer_recurring_payment\b/i);
    expect(allSql).not.toMatch(/UPDATE\s+invoice\b/i);
  });

  it('refuses to run when an audited lesson no longer matches', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 0 }];
      }
      if (sql.includes('e.id AS enrolmentId')) {
        return targetEnrolments;
      }
      if (sql.includes('COUNT(*) AS auditedCount')) {
        return [{ auditedCount: 22, matchingCount: 21 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairRichmondHillCustomer11170PaymentCycleLinks1791500001000();

    await expect(migration.up(queryRunner)).rejects.toThrow(
      'audited baseline partially matches',
    );

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('SET pcl.isDeleted = 1');
  });

  it('refuses to run if additional stale links now exist', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 0 }];
      }
      if (sql.includes('e.id AS enrolmentId')) {
        return targetEnrolments;
      }
      if (sql.includes('COUNT(*) AS auditedCount')) {
        return [{ auditedCount: 22, matchingCount: 22 }];
      }
      if (sql.includes('COUNT(DISTINCT stale.lessonId) AS staleCount')) {
        return [{ staleCount: 23 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairRichmondHillCustomer11170PaymentCycleLinks1791500001000();

    await expect(migration.up(queryRunner)).rejects.toThrow(
      'expected 22 stale cycle links',
    );

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('SET pcl.isDeleted = 1');
  });

  it('is idempotent when the guarded repair is already applied', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 22 }];
      }
      if (sql.includes('COUNT(*) AS invalidCount')) {
        return [{ invalidCount: 0 }];
      }
      if (sql.includes('COUNT(DISTINCT stale.lessonId) AS staleCount')) {
        return [{ staleCount: 0 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairRichmondHillCustomer11170PaymentCycleLinks1791500001000();

    await migration.up(queryRunner);

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('SET pcl.isDeleted = 1');
    expect(allSql).not.toContain(
      'INSERT INTO payment_cycle_lesson (paymentCycleId, lessonId, isDeleted)',
    );
  });

  it('refuses to continue from a partial backup', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 11 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairRichmondHillCustomer11170PaymentCycleLinks1791500001000();

    await expect(migration.up(queryRunner)).rejects.toThrow(
      'expected 22 backup rows, found 11',
    );

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('SET pcl.isDeleted = 1');
  });

  it('completes as a no-op when the target enrolment does not exist', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 0 }];
      }
      if (sql.includes('e.id AS enrolmentId')) {
        return [];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairRichmondHillCustomer11170PaymentCycleLinks1791500001000();

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('COUNT(*) AS auditedCount');
    expect(allSql).not.toContain('SET pcl.isDeleted = 1');
    expect(allSql).not.toContain(
      'INSERT INTO payment_cycle_lesson (paymentCycleId, lessonId, isDeleted)',
    );
  });

  it('refuses to run when only one target enrolment exists', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 0 }];
      }
      if (sql.includes('e.id AS enrolmentId')) {
        return [targetEnrolments[0]];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairRichmondHillCustomer11170PaymentCycleLinks1791500001000();

    await expect(migration.up(queryRunner)).rejects.toThrow(
      'expected 2 matching target enrolments, found 1',
    );

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('SET pcl.isDeleted = 1');
  });

  it('completes as a no-op when the audited lesson graph has no matches', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 0 }];
      }
      if (sql.includes('e.id AS enrolmentId')) {
        return targetEnrolments;
      }
      if (sql.includes('COUNT(*) AS auditedCount')) {
        return [{ auditedCount: 22, matchingCount: 0 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairRichmondHillCustomer11170PaymentCycleLinks1791500001000();

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('SET pcl.isDeleted = 1');
    expect(allSql).not.toContain(
      'INSERT INTO payment_cycle_lesson (paymentCycleId, lessonId, isDeleted)',
    );
  });
});
