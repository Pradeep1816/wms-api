import { describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import type { GroupLesson } from '../../lesson/entities/group-lesson.entity';
import type { CreditUsage } from '../../payment/entities/credit-usage.entity';
import type { LessonPayment } from '../../payment/entities/lesson-payment.entity';
import type { Payment } from '../../payment/entities/payment.entity';
import type { Invoice } from '../entities/invoice.entity';
import type { InvoicePayment } from '../entities/invoice-payment.entity';
import { InvoicePaymentEditRepository } from './invoice-payment-edit.repository';

function createSumRepository(total: string) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getRawOne: vi.fn().mockResolvedValue({ total }),
  };

  return {
    repository: {
      createQueryBuilder: vi.fn(() => builder),
    },
    builder,
  };
}

describe('InvoicePaymentEditRepository payment balance calculation', () => {
  it.each([
    ['mixed allocations', 312.83, '139.4400', '173.3800', 0.01],
    ['binary floating-point boundary', 0.3, '0.1000', '0.2000', 0],
    ['four-decimal payment credit', 1, '0.3333', '0.3333', 0.3334],
  ])(
    'uses exact decimal arithmetic for %s',
    async (_label, amount, invoiceUsed, lessonUsed, expectedBalance) => {
      const invoicePayments = createSumRepository(invoiceUsed);
      const lessonPayments = createSumRepository(lessonUsed);
      const repository = new InvoicePaymentEditRepository(
        {} as Repository<Payment>,
        invoicePayments.repository as unknown as Repository<InvoicePayment>,
        {} as Repository<Invoice>,
        lessonPayments.repository as unknown as Repository<LessonPayment>,
        {} as Repository<CreditUsage>,
        {} as Repository<GroupLesson>,
      );

      const balance = await repository.calculatePaymentBalance(1795156, amount);

      expect(balance).toBe(expectedBalance);
      expect(invoicePayments.builder.getRawOne).toHaveBeenCalledOnce();
      expect(lessonPayments.builder.getRawOne).toHaveBeenCalledOnce();
    },
  );
});
