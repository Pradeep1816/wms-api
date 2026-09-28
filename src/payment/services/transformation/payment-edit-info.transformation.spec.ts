import { describe, expect, it } from 'vitest';
import { PaymentEditInfoTransformation } from './payment-edit-info.transformation';

describe('PaymentEditInfoTransformation', () => {
  it('includes the actual group lesson allocation', () => {
    const transformation = new PaymentEditInfoTransformation();

    const [result] = transformation.transformGroupLessons([
      {
        id: 7001,
        date: '2026-09-16T15:30:00.000Z',
        studentName: 'Trial 123',
        programName: 'Level 5 Theory',
        invoiced: 'Yes',
        amount: '143.7500',
        paymentAmount: '143.7400',
        balance: '0.0100',
      },
    ]);

    expect(result).toEqual(
      expect.objectContaining({
        id: 7001,
        amount: '$143.75',
        payment: '$143.74',
        balance: '$0.01',
      }),
    );
  });
});
