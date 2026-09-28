import { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { RepairRichmondHillAriaCentResiduals1791500002000 } from '../1791500002000-RepairRichmondHillAriaCentResiduals';

describe('RepairRichmondHillAriaCentResiduals1791500002000', () => {
  it('creates auditable cent corrections and safely rolls them back', async () => {
    let backupCountCalls = 0;
    let transactionId = 1000;
    let paymentId = 2000;
    let lessonPaymentId = 3000;
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        backupCountCalls += 1;
        return [{ rowCount: backupCountCalls === 1 ? 0 : 2 }];
      }
      if (sql.includes("name = 'Account Entry'")) {
        return [{ matchingCount: 1 }];
      }
      if (sql.includes('AS matchingCount')) {
        return [{ matchingCount: 2 }];
      }
      if (sql.includes('COUNT(*) AS invalidCount')) {
        return [{ invalidCount: 0 }];
      }
      if (sql.includes('INSERT INTO `transaction`')) {
        transactionId += 1;
        return { insertId: transactionId, affectedRows: 1 };
      }
      if (sql.includes('INSERT INTO payment (')) {
        paymentId += 1;
        return { insertId: paymentId, affectedRows: 1 };
      }
      if (sql.includes('INSERT INTO lesson_payment (')) {
        lessonPaymentId += 1;
        return { insertId: lessonPaymentId, affectedRows: 1 };
      }
      if (sql.includes('SELECT\n        lessonId,')) {
        return [
          {
            lessonId: 5341508,
            privateLessonId: 4868763,
            correctionTransactionId: 1001,
            correctionPaymentId: 2001,
            correctionLessonPaymentId: 3001,
          },
          {
            lessonId: 5341513,
            privateLessonId: 4868768,
            correctionTransactionId: 1002,
            correctionPaymentId: 2002,
            correctionLessonPaymentId: 3002,
          },
        ];
      }
      if (/\b(UPDATE|DELETE)\b/.test(sql)) {
        return { affectedRows: 1 };
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration = new RepairRichmondHillAriaCentResiduals1791500002000();

    await migration.up(queryRunner);
    await migration.down(queryRunner);

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).toContain('5341508 AS lessonId');
    expect(allSql).toContain('5341513 AS lessonId');
    expect(allSql).not.toContain('5429164 AS lessonId');
    expect(allSql).toContain('INSERT INTO payment (');
    expect(allSql).toContain('INSERT INTO lesson_payment (');
    expect(allSql).toContain('SET balance = 0.0000');
    expect(allSql).toContain('SET balance = 0.0100');
    expect(allSql).not.toMatch(/UPDATE\s+invoice\b/i);
    expect(allSql).not.toMatch(/INSERT INTO\s+invoice_payment\b/i);
    expect(allSql).not.toMatch(/INSERT INTO\s+credit_usage\b/i);
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
    const migration = new RepairRichmondHillAriaCentResiduals1791500002000();

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('INSERT INTO payment (');
    expect(allSql).not.toContain('UPDATE private_lesson');
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
    const migration = new RepairRichmondHillAriaCentResiduals1791500002000();

    await expect(migration.up(queryRunner)).rejects.toThrow(
      'expected 2 matching baseline lessons, found 1',
    );

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('INSERT INTO payment (');
    expect(allSql).not.toContain('UPDATE private_lesson');
  });

  it('is idempotent when both guarded corrections already exist', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 2 }];
      }
      if (sql.includes('COUNT(*) AS invalidCount')) {
        return [{ invalidCount: 0 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration = new RepairRichmondHillAriaCentResiduals1791500002000();

    await migration.up(queryRunner);

    const allSql = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(allSql).not.toContain('INSERT INTO payment (');
    expect(allSql).not.toContain('UPDATE private_lesson');
  });

  it('refuses to continue from a partial backup', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 1 }];
      }
      return [];
    });
    const queryRunner = { query } as unknown as QueryRunner;
    const migration = new RepairRichmondHillAriaCentResiduals1791500002000();

    await expect(migration.up(queryRunner)).rejects.toThrow(
      'expected 2 backup rows, found 1',
    );
  });
});
