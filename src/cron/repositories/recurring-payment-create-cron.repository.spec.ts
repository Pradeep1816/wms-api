import { describe, expect, it, vi } from 'vitest';
import { Payment } from '../../payment/entities/payment.entity';
import { RecurringPaymentCreateCronRepository } from './recurring-payment-create-cron.repository';
import { ProgramTypeEnum } from '../../program/enums/program-type';

describe('RecurringPaymentCreateCronRepository rounding', () => {
  it('rounds recurring payment lesson amounts through the shared money helper', () => {
    const repository = new RecurringPaymentCreateCronRepository({} as any, {} as any);

    expect((repository as any).roundToTwo(0.145)).toBe(0.15);

    expect(
      (repository as any).calculateGroupLessonNetPrice(
        {
          id: 1,
          enrolmentId: 1,
          programType: 2,
          programRate: 0.145,
          duration: '00:30:00',
          tax: 0,
          creditApplied: 0,
        },
        [],
      ),
    ).toBe(0.15);
  });

  it('prefers the stored private lesson total when one exists', () => {
    const repository = new RecurringPaymentCreateCronRepository({} as any, {} as any);

    const candidate = (repository as any).toLessonCandidate(
      {
        id: 1,
        enrolmentId: 10,
        programType: ProgramTypeEnum.PRIVATE_PROGRAM,
        programRate: 64.98,
        duration: '00:15:00',
        tax: 0,
        creditApplied: 0,
        privateLessonTotal: 15.62,
      },
      new Map(),
    );

    expect(candidate.netPrice).toBe(15.62);
    expect(candidate.owingAmount).toBe(15.62);
  });

  it('falls back to recalculating a private lesson total when the stored value is missing', () => {
    const repository = new RecurringPaymentCreateCronRepository({} as any, {} as any);

    const candidate = (repository as any).toLessonCandidate(
      {
        id: 2,
        enrolmentId: 11,
        programType: ProgramTypeEnum.PRIVATE_PROGRAM,
        programRate: 64.98,
        duration: '00:15:00',
        tax: 0,
        creditApplied: 0,
        privateLessonTotal: null,
      },
      new Map(),
    );

    expect(candidate.netPrice).toBe(16.25);
    expect(candidate.owingAmount).toBe(16.25);
  });

  it('reconciles remaining payment credit at the database money scale', async () => {
    const repository = new RecurringPaymentCreateCronRepository({} as any, {} as any);
    const payment = { id: 1, amount: 1, balance: 1 } as Payment;
    const totals = ['0.3333', '0.3333'];
    const manager = {
      findOne: vi.fn().mockResolvedValue(payment),
      createQueryBuilder: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getRawOne: vi.fn().mockResolvedValue({ total: totals.shift() }),
      })),
      save: vi.fn().mockImplementation((_entity, value) => Promise.resolve(value)),
    };

    await (repository as any).recalculatePaymentBalance(1, manager);

    expect(payment.balance).toBe(0.3334);
    expect(manager.save).toHaveBeenCalledWith(Payment, payment);
  });
});

describe('RecurringPaymentCreateCronRepository owing candidates', () => {
  const repository = new RecurringPaymentCreateCronRepository({} as never, {} as never);

  const toOwingCandidate = (row: {
    programType: number;
    creditApplied?: number;
    privateLessonId?: number | null;
    privateLessonBalance?: number;
    privateLessonTotal?: number;
  }) =>
    (repository as any).toOwingCandidate({
      id: 1,
      enrolmentId: 10,
      creditApplied: 0,
      privateLessonId: null,
      privateLessonBalance: 0,
      privateLessonTotal: 0,
      ...row,
    });

  it('pays a private lesson from private_lesson.balance', () => {
    const candidate = toOwingCandidate({
      programType: ProgramTypeEnum.PRIVATE_PROGRAM,
      privateLessonId: 99,
      privateLessonBalance: 31.25,
      privateLessonTotal: 31.25,
    });

    expect(candidate.isPrivate).toBe(true);
    expect(candidate.owingAmount).toBe(31.25);
    expect(candidate.netPrice).toBe(31.25);
  });

  it('skips a private lesson with no private_lesson row', () => {
    const candidate = toOwingCandidate({
      programType: ProgramTypeEnum.PRIVATE_PROGRAM,
      privateLessonId: null,
    });

    expect(candidate.owingAmount).toBe(0);
  });

  it('skips a private lesson whose stored balance is 0', () => {
    const candidate = toOwingCandidate({
      programType: ProgramTypeEnum.PRIVATE_PROGRAM,
      privateLessonId: 99,
      privateLessonBalance: 0,
      privateLessonTotal: 31.25,
    });

    expect(candidate.owingAmount).toBe(0);
    expect(candidate.netPrice).toBe(31.25);
  });

  it('does not collect group lessons on recurring payment', () => {
    const candidate = toOwingCandidate({
      programType: ProgramTypeEnum.GROUP_PROGRAM,
      privateLessonId: 99,
      privateLessonBalance: 18.5,
      privateLessonTotal: 20,
    });

    expect(candidate.isPrivate).toBe(false);
    expect(candidate.owingAmount).toBe(0);
  });

  it('does not use a reconstructed private price when the private_lesson row is missing', () => {
    const candidate = toOwingCandidate({
      programType: ProgramTypeEnum.PRIVATE_PROGRAM,
      privateLessonId: null,
      privateLessonBalance: 31.25,
      privateLessonTotal: 31.25,
    });

    expect(candidate.owingAmount).toBe(0);
  });
});
