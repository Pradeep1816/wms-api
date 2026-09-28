import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ReceivePaymentNegativeService } from './receive-payment-negative.service';

function groupRefundAllocations(
  allocations: Array<{
    originalPaymentId: number;
    itemCategoryId: number;
    amount: number;
  }>,
  refundedPaymentCredits: Map<number, number>,
) {
  const service = new ReceivePaymentNegativeService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return (
    service as unknown as {
      groupRefundAllocations: (
        items: typeof allocations,
        credits: Map<number, number>,
      ) => Map<number, Array<{ itemCategoryId: number; amount: number }>>;
    }
  ).groupRefundAllocations(allocations, refundedPaymentCredits);
}

describe('ReceivePaymentNegativeService refund allocations', () => {
  it('groups category allocations by the original payment', () => {
    const grouped = groupRefundAllocations(
      [
        { originalPaymentId: 10, itemCategoryId: 1, amount: 25 },
        { originalPaymentId: 10, itemCategoryId: 19, amount: 15 },
        { originalPaymentId: 11, itemCategoryId: 20, amount: 10 },
      ],
      new Map([
        [10, 40],
        [11, 10],
      ]),
    );

    expect(grouped.get(10)).toEqual([
      { itemCategoryId: 1, amount: 25 },
      { itemCategoryId: 19, amount: 15 },
    ]);
    expect(grouped.get(11)).toEqual([
      { itemCategoryId: 20, amount: 10 },
    ]);
  });

  it('rejects allocations for a payment that is not being refunded', () => {
    expect(() =>
      groupRefundAllocations(
        [{ originalPaymentId: 99, itemCategoryId: 1, amount: 10 }],
        new Map([[10, 10]]),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects category amounts that do not equal the payment refund', () => {
    expect(() =>
      groupRefundAllocations(
        [{ originalPaymentId: 10, itemCategoryId: 1, amount: 9 }],
        new Map([[10, 10]]),
      ),
    ).toThrow('must equal 10.00');
  });
});
