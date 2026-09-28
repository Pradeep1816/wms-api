import { describe, expect, it, vi } from 'vitest';
import type { EntityManager, Repository } from 'typeorm';
import type { LessonPayment } from '../../lesson/entities/lesson-payment.entity';
import { Payment } from '../../payment/entities/payment.entity';
import type { Invoice } from '../entities/invoice.entity';
import type { InvoicePayment } from '../entities/invoice-payment.entity';
import { InvoicePaymentDetailsRepository } from './invoice-payment-details.repository';

function createSumBuilder(total: string) {
  return {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getRawOne: vi.fn().mockResolvedValue({ total }),
  };
}

describe('InvoicePaymentDetailsRepository payment balance recalculation', () => {
  it('removes binary drift after an allocation is deleted', async () => {
    const payment = {
      id: 1795156,
      amount: 312.83,
      balance: 312.83,
    } as Payment;
    const paymentRepository = {
      findOne: vi.fn().mockResolvedValue(payment),
      save: vi.fn().mockImplementation((value) => Promise.resolve(value)),
    };
    const sumBuilders = [
      createSumBuilder('139.4400'),
      createSumBuilder('173.3800'),
    ];
    const manager = {
      getRepository: vi.fn((entity) => {
        if (entity === Payment) return paymentRepository;
        throw new Error('Unexpected repository');
      }),
      createQueryBuilder: vi.fn(() => sumBuilders.shift()),
    } as unknown as EntityManager;
    const repository = new InvoicePaymentDetailsRepository(
      {} as Repository<Invoice>,
      {} as Repository<InvoicePayment>,
      {} as Repository<Payment>,
      {} as Repository<LessonPayment>,
    );

    await repository.recalculatePaymentBalance(1795156, 694, manager);

    expect(payment.balance).toBe(0.01);
    expect(payment.updatedByUserId).toBe(694);
    expect(paymentRepository.save).toHaveBeenCalledWith(payment);
  });
});
