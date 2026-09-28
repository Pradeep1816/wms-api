import { describe, expect, it, vi } from 'vitest';
import type { EntityManager } from 'typeorm';
import { InvoicePayment } from '../../../invoice/entities/invoice-payment.entity';
import { CreditUsage } from '../../../payment/entities/credit-usage.entity';
import { Payment } from '../../../payment/entities/payment.entity';
import { LessonPayment } from '../../entities/lesson-payment.entity';
import { PrivateLessonDeleteRepository } from './private-lesson-delete.repository';

function createLessonPaymentBuilder() {
  return {
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getRawMany: vi
      .fn()
      .mockResolvedValue([
        { paymentId: 1795156, lessonId: 5275131, enrolmentId: 33855 },
      ]),
  };
}

function createSumBuilder(field: 'sum' | 'total', amount: string) {
  return {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getRawOne: vi.fn().mockResolvedValue({ [field]: amount }),
  };
}

describe('PrivateLessonDeleteRepository payment balance recalculation', () => {
  it('restores exact payment credit after a paid lesson is deleted', async () => {
    const payment = {
      id: 1795156,
      amount: 312.83,
      balance: 0,
      paymentMethodId: 4,
      isDeleted: 0,
    } as Payment;
    const paymentRepository = {
      findOne: vi.fn().mockResolvedValue(payment),
      save: vi.fn().mockImplementation((value) => Promise.resolve(value)),
    };
    const lessonPaymentBuilders = [
      createLessonPaymentBuilder(),
      createSumBuilder('total', '173.3800'),
    ];
    const lessonPaymentRepository = {
      createQueryBuilder: vi.fn(() => lessonPaymentBuilders.shift()),
    };
    const invoicePaymentRepository = {
      createQueryBuilder: vi.fn(() => createSumBuilder('total', '139.4400')),
    };
    const manager = {
      getRepository: vi.fn((entity) => {
        if (entity === Payment) return paymentRepository;
        if (entity === LessonPayment) return lessonPaymentRepository;
        if (entity === InvoicePayment) return invoicePaymentRepository;
        if (entity === CreditUsage) return {};
        throw new Error('Unexpected repository');
      }),
    } as unknown as EntityManager;
    const repository = new PrivateLessonDeleteRepository();

    await repository.recalculatePaymentBalancesForLessonPayments(
      [1992441],
      manager,
    );

    expect(payment.balance).toBe(0.01);
    expect(paymentRepository.save).toHaveBeenCalledWith(payment);
  });
});
