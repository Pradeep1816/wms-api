import { describe, expect, it, vi } from 'vitest';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { RoyaltyReportRepository } from './royalty-report.repository';

describe('RoyaltyReportRepository legacy POS royalty', () => {
  it('aggregates dated POS payment, tax, and royalty-free source amounts', async () => {
    const query = vi
      .fn<
        (
          sql: string,
          parameters: unknown[],
        ) => Promise<Array<Record<string, string>>>
      >()
      .mockResolvedValue([
        {
          paymentsReceived: '113.00',
          taxCollected: '13.00',
          royaltyFreeItems: '10.00',
        },
      ]);
    const repository = new RoyaltyReportRepository(
      {} as never,
      { manager: { query } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      repository.getLegacyPosRoyaltyAmounts(1, '2026-09-01', '2026-09-30'),
    ).resolves.toEqual({
      paymentsReceived: 113,
      taxCollected: 13,
      royaltyFreeItems: 10,
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("status IN ('PAID', 'REFUNDED')");
    expect(sql).toContain("status = 'REFUNDED'");
    expect(sql).toContain('refundPaymentId AS eventPaymentId');
    expect(sql).toContain('posEvent.direction');
    expect(sql).toContain('pos.locationId = ?');
    expect(sql).toContain('pos.totalAmount * posEvent.direction AS paymentsReceived');
    expect(parameters).toEqual([
      1,
      PaymentMethod.TYPE_ACCOUNT_ENTRY,
      PaymentMethod.TYPE_CREDIT_USED,
      PaymentMethod.TYPE_CREDIT_APPLIED,
      PaymentMethod.TYPE_GIFT_CARD,
      '2026-09-01',
      '2026-09-30',
    ]);
  });
});
