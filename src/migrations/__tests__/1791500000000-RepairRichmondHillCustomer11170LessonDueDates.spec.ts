import { describe, expect, it, vi } from 'vitest';
import { QueryRunner } from 'typeorm';
import { RepairRichmondHillCustomer11170LessonDueDates1791500000000 } from '../1791500000000-RepairRichmondHillCustomer11170LessonDueDates';

describe('RepairRichmondHillCustomer11170LessonDueDates1791500000000', () => {
  it('repairs only guarded lesson due dates and restores them on rollback', async () => {
    let backupCountCalls = 0;
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        backupCountCalls += 1;
        return [{ rowCount: backupCountCalls === 1 ? 0 : 25 }];
      }
      if (sql.includes('e.id AS enrolmentId')) {
        return [
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
      }
      if (sql.includes('COUNT(*) AS auditedCount')) {
        return [{ auditedCount: 23, matchingCount: 23 }];
      }
      if (sql.includes('HAVING COUNT(*) > 1')) {
        return [];
      }
      if (sql.includes('COUNT(*) AS invalidCount')) {
        return [{ invalidCount: 0 }];
      }
      if (sql.includes('COUNT(*) AS remainingCount')) {
        return [{ remainingCount: 0 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairRichmondHillCustomer11170LessonDueDates1791500000000();

    await migration.up(queryRunner);
    await migration.down(queryRunner);

    const lessonUpdates = query.mock.calls
      .filter(([sql]) => String(sql).includes('UPDATE lesson l'))
      .map(([sql, parameters]) => ({ sql: String(sql), parameters }));

    expect(lessonUpdates).toHaveLength(2);
    expect(lessonUpdates[0].sql).toContain('l.dueDate = b.newDueDate');
    expect(lessonUpdates[1].sql).toContain('l.dueDate = b.oldLessonDueDate');
    expect(lessonUpdates[0].parameters).toEqual([migration.name]);
    expect(lessonUpdates[1].parameters).toEqual([migration.name]);

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toMatch(
      /UPDATE\s+(private_lesson|lesson_payment|payment)\b/i,
    );
    expect(allSql).not.toMatch(/UPDATE\s+customer_recurring_payment\b/i);
  });

  it('refuses to run when an audited target no longer matches', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 0 }];
      }
      if (sql.includes('e.id AS enrolmentId')) {
        return [
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
      }
      if (sql.includes('COUNT(*) AS auditedCount')) {
        return [{ auditedCount: 23, matchingCount: 22 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairRichmondHillCustomer11170LessonDueDates1791500000000();

    await expect(migration.up(queryRunner)).rejects.toThrow(
      'audited baseline partially matches',
    );
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('UPDATE lesson l')),
    ).toBe(false);
  });

  it('is idempotent when the guarded repair is already applied', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 25 }];
      }
      if (sql.includes('COUNT(*) AS invalidCount')) {
        return [{ invalidCount: 0 }];
      }
      if (sql.includes('COUNT(*) AS remainingCount')) {
        return [{ remainingCount: 0 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairRichmondHillCustomer11170LessonDueDates1791500000000();

    await migration.up(queryRunner);

    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('UPDATE lesson l')),
    ).toBe(false);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO `migration_rh_11170'),
      ),
    ).toBe(false);
  });

  it('completes as a no-op when neither target enrolment exists', async () => {
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
      new RepairRichmondHillCustomer11170LessonDueDates1791500000000();

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('COUNT(*) AS auditedCount');
    expect(allSql).not.toContain('UPDATE lesson l');
    expect(allSql).not.toContain('INSERT INTO `migration_rh_11170');
  });

  it('completes as a no-op when the audited lesson graph has no matches', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 0 }];
      }
      if (sql.includes('e.id AS enrolmentId')) {
        return [
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
      }
      if (sql.includes('COUNT(*) AS auditedCount')) {
        return [{ auditedCount: 23, matchingCount: 0 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration =
      new RepairRichmondHillCustomer11170LessonDueDates1791500000000();

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('UPDATE lesson l');
    expect(allSql).not.toContain('INSERT INTO `migration_rh_11170');
  });
});
