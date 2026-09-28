import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryRunner } from 'typeorm';

const customerBalanceMocks = vi.hoisted(() => ({
  calculateBalance: vi.fn(),
  upsertCustomerAccountBalance: vi.fn(),
}));

vi.mock(
  '../../customer/repositories/customer-balance-calculation.repository',
  () => ({
    CustomerBalanceCalculationRepository: class {
      calculateBalance = customerBalanceMocks.calculateBalance;
      upsertCustomerAccountBalance =
        customerBalanceMocks.upsertCustomerAccountBalance;
    },
  }),
);

import { FixSandyPurewalSeptemberPaymentAllocation1788937943000 } from '../1788937943000-FixSandyPurewalSeptemberPaymentAllocation';

describe('FixSandyPurewalSeptemberPaymentAllocation1788937943000', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customerBalanceMocks.calculateBalance.mockResolvedValue(0);
    customerBalanceMocks.upsertCustomerAccountBalance.mockResolvedValue(
      undefined,
    );
  });

  it('moves the guarded allocation to the September lesson and reverses it', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 1 }];
      }
      if (sql.includes('missingOldPrivateLesson')) {
        return [
          {
            matchingRows: 1,
            onOldLesson: 1,
            missingOldPrivateLesson: 1,
            validTargetPrivateLesson: 1,
          },
        ];
      }
      if (sql.includes('visibleAllocationCount')) {
        return [
          {
            movedRows: 1,
            activeOldRows: 0,
            paymentAllocationCount: 8,
            paymentAllocationTotal: 255,
            visibleAllocationCount: 8,
            visibleAllocationTotal: 255,
            targetBalance: 0,
            paymentBalance: 0,
          },
        ];
      }
      if (sql.includes('expectedTargetBalance')) {
        return [
          {
            restoredRows: 1,
            targetBalance: 31.25,
            expectedTargetBalance: 31.25,
            paymentBalance: 0,
            expectedPaymentBalance: 0,
          },
        ];
      }
      return [];
    });
    const queryRunner = {
      query,
      connection: {},
      manager: {},
    } as unknown as QueryRunner;
    const migration =
      new FixSandyPurewalSeptemberPaymentAllocation1788937943000();

    await migration.up(queryRunner);
    await migration.down(queryRunner);

    const lessonPaymentUpdates = query.mock.calls
      .filter(([sql]) => String(sql).includes('UPDATE lesson_payment lp'))
      .map(([sql, parameters]) => ({ sql: String(sql), parameters }));

    expect(lessonPaymentUpdates).toHaveLength(2);
    expect(lessonPaymentUpdates[0].sql).toContain(
      'lp.lessonId = b.newLessonId',
    );
    expect(lessonPaymentUpdates[0].parameters).toEqual([migration.name, 727]);
    expect(lessonPaymentUpdates[1].sql).toContain(
      'lp.lessonId = b.oldLessonId',
    );
    expect(lessonPaymentUpdates[1].parameters).toEqual([migration.name]);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO private_lesson'),
      ),
    ).toBe(false);
    expect(customerBalanceMocks.calculateBalance).toHaveBeenCalledTimes(2);
    expect(
      customerBalanceMocks.upsertCustomerAccountBalance,
    ).toHaveBeenCalledTimes(2);
  });

  it('is a safe no-op when the Sandy payment is absent', async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes('COUNT(*) AS rowCount')) {
        return [{ rowCount: 0 }];
      }
      if (sql.includes('FROM payment p')) {
        return [];
      }
      return [];
    });
    const queryRunner = {
      query,
      connection: {},
      manager: {},
    } as unknown as QueryRunner;
    const migration =
      new FixSandyPurewalSeptemberPaymentAllocation1788937943000();

    await migration.up(queryRunner);

    expect(customerBalanceMocks.calculateBalance).not.toHaveBeenCalled();
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE lesson_payment lp'),
      ),
    ).toBe(false);
  });
});
