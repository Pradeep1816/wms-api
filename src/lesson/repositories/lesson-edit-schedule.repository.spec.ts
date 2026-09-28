import { describe, expect, it, vi } from 'vitest';
import { LessonEditScheduleRepository } from './lesson-edit-schedule.repository';
import { Payment } from '../../payment/entities/payment.entity';

function createQueryRunnerMock() {
  let rawManyResult: Array<Record<string, any>> = [];
  let rawOneCallCount = 0;
  const updateSpy = vi.fn();
  const setSpy = vi.fn().mockReturnThis();
  const executeSpy = vi.fn().mockResolvedValue(undefined);

  const builder: any = {
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    getRawMany: vi.fn(async () => rawManyResult),
    getRawOne: vi.fn(async () => {
      rawOneCallCount += 1;
      if (rawOneCallCount === 1) {
        return { total: '15.62505', amount: '15.62505', id: 99 };
      }
      if (rawOneCallCount === 2) {
        return { total: '0' };
      }
      return { total: '0' };
    }),
    update: updateSpy.mockReturnThis(),
    set: setSpy,
    execute: executeSpy,
  };

  const paymentUpdateSpy = vi.fn();

  const manager: any = {
    createQueryBuilder: vi.fn(() => builder),
    getRepository: vi.fn((entity: unknown) => {
      if (entity === Payment) {
        return {
          update: paymentUpdateSpy,
        };
      }
      return {
        update: vi.fn(),
      };
    }),
  };

  return {
    queryRunner: {
      manager,
    },
    setRawManyResult(rows: Array<Record<string, any>>) {
      rawManyResult = rows;
    },
    builder,
    paymentUpdateSpy,
  };
}

describe('LessonEditScheduleRepository rounding', () => {
  it('uses the shared decimal helper when trimming private lesson overpayment', async () => {
    const repository = new LessonEditScheduleRepository();
    const mock = createQueryRunnerMock();
    mock.setRawManyResult([
      {
        id: 11,
        amount: '15.63',
        paymentId: 99,
      },
    ]);

    const affected = await repository.trimPrivateLessonOverpayment(
      501,
      700,
      15.625,
      mock.queryRunner as any,
    );

    expect(affected).toEqual([99]);
    expect(mock.builder.set).toHaveBeenCalledWith({ amount: 15.62 });
    expect(mock.builder.where).toHaveBeenCalledWith('id = :id', { id: 11 });
  });

  it('rounds recalculated payment balances at four decimals', async () => {
    const repository = new LessonEditScheduleRepository();
    const mock = createQueryRunnerMock();
    const balanceSpy = vi.fn();
    mock.builder.getRawOne = vi
      .fn()
      .mockResolvedValueOnce({ id: 99, amount: '15.62505' })
      .mockResolvedValueOnce({ total: '0' })
      .mockResolvedValueOnce({ total: '0' });
    mock.queryRunner.manager.getRepository = vi.fn((entity: unknown) => {
      if (entity === Payment) {
        return {
          update: balanceSpy,
        };
      }
      return {
        update: vi.fn(),
      };
    });

    await repository.recalculatePaymentBalances([99], mock.queryRunner as any);

    expect(balanceSpy).toHaveBeenCalledWith(
      { id: 99 },
      { balance: 15.6251 },
    );
  });
});
