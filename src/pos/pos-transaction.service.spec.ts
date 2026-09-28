import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { PosTransactionService } from './pos-transaction.service';
import {
  PosTransaction,
  PosTransactionReversalType,
  PosTransactionStatus,
} from './entities/pos-transaction.entity';
import { PosTransactionLineItem } from './entities/pos-transaction-line-item.entity';
import { Item } from '../item/entities/item.entity';
import { LocationWalkinCustomer } from '../location/entities/location-walkin-customer.entity';
import { ItemLocationStock } from '../item/entities/item-location-stock.entity';
import { ItemCategory } from '../item/entities/item-category.entity';
import { Payment } from '../payment/entities/payment.entity';
import { PaymentMethod } from '../payment/entities/payment-method.entity';

vi.mock('../utils/royality/royalty-calculation.util', () => ({
  resolveRoyaltySnapshot: vi.fn(async () => ({ categoryId: 7, rate: 5, advertisementRate: 1.25 })),
}));

function fixture() {
  const item = Object.assign(new Item(), {
    id: 10,
    locationId: 15,
    status: 1,
    isDeleted: false,
    price: 25,
    taxStatusId: 1,
    code: 'BOOK',
    upcCode: '123456789012',
    description: 'Lesson Book',
    itemCategoryId: 8,
    royaltyFree: 1,
  });
  const line = Object.assign(new PosTransactionLineItem(), {
    id: 20,
    posTransactionId: 1,
    itemId: 10,
    item,
    price: 25,
    quantity: 1,
    discount: 0,
  });
  const sale = Object.assign(new PosTransaction(), {
    id: 1,
    locationId: 15,
    customerId: 100,
    isWalkIn: false,
    status: PosTransactionStatus.DRAFT,
    paidAmount: 0,
    paymentId: null,
    refundPaymentId: null,
    reversalType: null,
    reversalReason: null,
    reversedByUserId: null,
    reversedAt: null,
    discountAmount: 0,
    lineItems: [line],
  });
  const walkInCustomer = Object.assign(new LocationWalkinCustomer(), {
    locationId: 15,
    customerId: 900,
  });
  const payments: Payment[] = [];
  const categories = [
    Object.assign(new ItemCategory(), { id: 8, name: 'Books' }),
    Object.assign(new ItemCategory(), { id: 7, name: 'Royalty Books' }),
  ];
  const method = { id: 4, active: 1, displayed: 1 };
  const stock = Object.assign(new ItemLocationStock(), {
    itemId: 10,
    locationId: 15,
    trackInventory: true,
    stockQuantity: 5,
    lowStockQuantity: 2,
  });
  const stockRows = [stock];
  const find = (rows: any[], options: any) =>
    rows.find((row) =>
      Object.entries(options.where).every(([key, value]) => row[key] === value),
    ) || null;
  const repositories = new Map<any, any>();
  const manager: any = {
    queryRunner: { isTransactionActive: true },
    insert: vi.fn(),
    getRepository: (entity: any) => repositories.get(entity),
    query: vi.fn(async () => [{ count: 0 }]),
    save: vi.fn(async (_entity: any, value: any) => value),
    transaction: vi.fn(async (action: any) => {
      const originalSale = { ...sale };
      const originalStock = stockRows.map((row) => ({
        row,
        stockQuantity: row.stockQuantity,
      }));
      const count = payments.length;
      try {
        return await action(manager);
      } catch (error) {
        Object.assign(sale, originalSale);
        for (const entry of originalStock) {
          entry.row.stockQuantity = entry.stockQuantity;
        }
        payments.splice(count);
        throw error;
      }
    }),
  };
  const saleRepo = {
    manager,
    findOne: vi.fn(async (options: any) => find([sale], options)),
    findAndCount: vi.fn(async () => [[sale], 1]),
    save: vi.fn(async (value: any) => value),
    query: vi.fn(async (sql: string) =>
      sql.includes('province_id')
        ? [{ provinceId: 1 }]
        : sql.includes('FROM payment')
          ? payments.map((payment) => ({
              id: payment.id,
              date: payment.date,
              reference: payment.reference,
              amount: payment.amount,
              paymentMethodId: payment.paymentMethodId,
              paymentMethodName: 'Cash',
            }))
          : [{ id: 100, firstname: 'Test', lastname: 'Customer' }],
    ),
  };
  const lineRepo = {
    manager,
    save: vi.fn(async (value: any) => value),
    findOne: vi.fn(async () => line),
  };
  const itemRepo = {
    manager,
    findOne: vi.fn(async (options: any) => find([item], options)),
  };
  const stockRepo = {
    manager,
    findOne: vi.fn(async (options: any) => find(stockRows, options)),
    save: vi.fn(async (values: ItemLocationStock[]) => values),
  };
  repositories.set(PosTransaction, saleRepo);
  repositories.set(PosTransactionLineItem, lineRepo);
  repositories.set(Item, itemRepo);
  repositories.set(LocationWalkinCustomer, {
    findOne: vi.fn(async (options: any) =>
      walkInCustomer.locationId === options.where.locationId
        ? walkInCustomer
        : null,
    ),
  });
  repositories.set(ItemLocationStock, stockRepo);
  repositories.set(ItemCategory, {
    findOne: vi.fn(async (options: any) => find(categories, options)),
  });
  repositories.set(Payment, {
    findOne: vi.fn(async (options: any) => find(payments, options)),
  });
  repositories.set(PaymentMethod, {
    findOne: vi.fn(async (options: any) => find([method], options)),
  });
  const balance = { recalculateAndPersist: vi.fn(async () => -100) };
  const paymentFactory = {
    createTransaction: vi.fn(async () => 500),
    createPayment: vi.fn(async (input: any, receivedManager: any) => {
      expect(receivedManager).toBe(manager);
      const payment = Object.assign(new Payment(), input, {
        id: 200 + payments.length,
        isDeleted: 0,
      });
      payments.push(payment);
      return payment;
    }),
  };
  const upcValidator = { validate: vi.fn(() => ({ valid: true })) };
  const locationService = { getLocationId: vi.fn().mockResolvedValue(15) };
  const service = new PosTransactionService(
    saleRepo as any,
    lineRepo as any,
    itemRepo as any,
    upcValidator as any,
    locationService as any,
    { getTaxRateByTaxStatusAndProvince: vi.fn(async () => 13) } as any,
    balance as any,
    paymentFactory as any,
  );
  const dto = { transactionId: 1, paymentMethodId: 4, amount: 28.25 };
  // Build historical paid records through the former checkout implementation.
  // New public checkout is separately asserted to require Create Invoice.
  const createHistoricalPayment = (dto, locationId, userId) => (service as any).withTransaction(
    dto.transactionId, locationId, scoped => scoped.processPaymentLocked(dto, userId));
  return {
    createHistoricalPayment,
    service,
    sale,
    item,
    line,
    stock,
    stockRows,
    stockRepo,
    categories,
    dto,
    payments,
    walkInCustomer,
    method,
    manager,
    saleRepo,
    balance,
    paymentFactory,
    upcValidator,
    locationService,
  };
}

describe('Historical POS checkout and reversal compatibility', () => {
  it('rejects new direct payment requests without changing the draft or stock', async () => {
    const f = fixture();
    await expect(f.service.processPayment(f.dto, 15, 7)).rejects.toThrow('POS now creates an invoice');
    expect(f.sale.status).toBe('DRAFT');
    expect(f.payments).toHaveLength(0);
  });
  it('requires named customers to be active', async () => {
    const f = fixture();

    await f.service.updateCustomer(1, { customerId: 100 }, 15);

    expect(f.saleRepo.query).toHaveBeenCalledWith(
      expect.stringContaining('AND (user.status = 2 OR EXISTS'),
      [15, 100],
    );
  });

  it('accepts the intentionally inactive mapped walk-in placeholder', async () => {
    const f = fixture();

    await f.service.updateCustomer(1, { isWalkIn: true }, 15);
    await expect(f.createHistoricalPayment(f.dto, 15, 7)).resolves.toMatchObject(
      {
        status: 'PAID',
        customerId: 900,
        isWalkIn: true,
      },
    );

    const customerValidationCall = f.saleRepo.query.mock.calls.find(([sql]) =>
      sql.includes('FROM user'),
    );
    expect(customerValidationCall).toBeDefined();
    expect(customerValidationCall?.[0]).not.toContain('AND user.status = 2');
    expect(customerValidationCall?.[1]).toEqual([15, 900]);
  });

  it('persists an optional walk-in customer name through payment', async () => {
    const f = fixture();
    await f.service.updateCustomer(
      1,
      { isWalkIn: true, customerInfo: '  Jamie Lee  ' },
      15,
    );
    expect(f.sale).toMatchObject({
      isWalkIn: true,
      customerId: null,
      customerInfo: 'Jamie Lee',
    });

    await expect(f.createHistoricalPayment(f.dto, 15, 7)).resolves.toMatchObject(
      {
        status: 'PAID',
        isWalkIn: true,
        customerId: 900,
        customerInfo: 'Jamie Lee',
      },
    );
    expect(f.payments).toHaveLength(1);
    expect(f.payments[0].userId).toBe(900);
  });

  it('saves the location walk-in identity and a full new payment without touching customer credit', async () => {
    const f = fixture();
    await f.service.updateCustomer(1, { isWalkIn: true }, 15);
    expect(f.sale).toMatchObject({
      isWalkIn: true,
      customerId: null,
      customerInfo: 'Walk-in Customer',
    });
    const paid = await f.createHistoricalPayment(f.dto, 15, 7);
    expect(paid).toMatchObject({
      status: 'PAID',
      isWalkIn: true,
      customerId: 900,
      customerInfo: 'Walk-in Customer',
    });
    expect(f.payments).toHaveLength(1);
    expect(f.payments[0]).toMatchObject({
      userId: 900,
      amount: 28.25,
      balance: 0,
    });
    expect(f.balance.recalculateAndPersist).not.toHaveBeenCalled();
    await expect(f.createHistoricalPayment(f.dto, 15, 7)).resolves.toMatchObject(
      { paymentId: 200 },
    );
    expect(f.payments).toHaveLength(1);
  });

  it('rejects walk-in payment when the location has no configured walk-in identity', async () => {
    const f = fixture();
    f.walkInCustomer.locationId = 99;
    await f.service.updateCustomer(1, { isWalkIn: true }, 15);
    await expect(f.createHistoricalPayment(f.dto, 15, 7)).rejects.toThrow(
      'not configured',
    );
    expect(f.payments).toHaveLength(0);
    expect(f.sale.customerId).toBeNull();
  });

  it('reports invalid or orphaned walk-in identities as missing location setup', async () => {
    const f = fixture();
    f.saleRepo.query.mockResolvedValueOnce([]);
    await f.service.updateCustomer(1, { isWalkIn: true }, 15);

    await expect(f.createHistoricalPayment(f.dto, 15, 7)).rejects.toThrow(
      'Walk-in customer is not configured for this location',
    );
    expect(f.payments).toHaveLength(0);
    expect(f.sale.customerId).toBeNull();
  });

  it('does not spend an existing payment or mix a named customer with walk-in mode', async () => {
    const f = fixture();
    await expect(
      f.service.updateCustomer(1, { isWalkIn: true, customerId: 100 }, 15),
    ).rejects.toThrow('cannot select');
    await f.service.updateCustomer(1, { isWalkIn: true }, 15);
    await expect(
      f.createHistoricalPayment({ ...f.dto, paymentId: 300 }, 15, 7),
    ).rejects.toThrow('requires a new payment');
    expect(f.payments).toHaveLength(0);
  });
});

describe('POS item lookup inventory', () => {
  it('returns tracked stock for the sale location', async () => {
    const f = fixture();

    await expect(
      f.service.findItemByCode('training-location', '123456789012'),
    ).resolves.toMatchObject({
      id: 10,
      upcCode: '123456789012',
      description: 'Lesson Book',
      trackInventory: true,
      stockQuantity: 5,
    });
    expect(f.locationService.getLocationId).toHaveBeenCalledWith(
      'training-location',
    );
    expect(f.stockRepo.findOne).toHaveBeenCalledWith({
      where: { itemId: 10, locationId: 15 },
    });
  });

  it('returns an unrestricted item when inventory tracking is off', async () => {
    const f = fixture();
    f.stock.trackInventory = false;

    await expect(
      f.service.findItemByCode('training-location', '123456789012'),
    ).resolves.toMatchObject({
      trackInventory: false,
      stockQuantity: null,
    });
  });
});

describe('POS checkout safety', () => {
  it('saves the payment, royalty snapshot and paid sale in one transaction without using existing credit', async () => {
    const f = fixture();
    const result = await f.createHistoricalPayment(f.dto, 15, 7);
    expect(result).toMatchObject({
      status: 'PAID',
      paymentId: 200,
      paidAmount: 28.25,
      balance: 0,
      tax: 3.25,
    });
    expect(f.stock.stockQuantity).toBe(4);
    expect(f.stockRepo.findOne).toHaveBeenCalledWith({
      where: { itemId: 10, locationId: 15 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(f.payments).toHaveLength(1);
    expect(f.payments[0]).toMatchObject({
      amount: 28.25,
      balance: 0,
      userId: 100,
    });
    expect(f.line).toMatchObject({
      royaltyCategoryId: 7,
      royaltyRateApplied: 5,
      advertisementRateApplied: 1.25,
      royaltyFreeSnapshot: 1,
      inventoryQuantityDeducted: 1,
      itemCodeSnapshot: 'BOOK',
      itemUpcCodeSnapshot: '123456789012',
      itemDescriptionSnapshot: 'Lesson Book',
      itemCategoryIdSnapshot: 8,
      itemCategoryNameSnapshot: 'Books',
      royaltyCategoryNameSnapshot: 'Royalty Books',
    });
    expect(f.balance.recalculateAndPersist).toHaveBeenCalledWith(100, {
      manager: f.manager,
      updatedByUserId: 7,
    });
    expect(f.saleRepo.findOne).toHaveBeenCalledWith({
      where: { id: 1, locationId: 15 },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('filters payment history by customer within the selected location', async () => {
    const f = fixture();

    await f.service.getPaymentHistory(15, 2, 5, 100);

    expect(f.saleRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          locationId: 15,
          customerId: 100,
        }),
        skip: 5,
        take: 5,
      }),
    );
  });

  it('keeps paid POS history labels unchanged after the catalog is edited', async () => {
    const f = fixture();
    await f.createHistoricalPayment(f.dto, 15, 7);
    f.item.code = 'NEW-BOOK';
    f.item.upcCode = '999999999999';
    f.item.description = 'Renamed Book';
    f.item.itemCategoryId = 7;
    f.categories[0].name = 'Renamed Books';

    const history = await f.service.getPaymentHistory(15);
    expect(history.data.body[0].lineItems[0]).toMatchObject({
      code: 'BOOK',
      upcCode: '123456789012',
      description: 'Lesson Book',
      itemCategoryId: 8,
      itemCategoryName: 'Books',
      price: 25,
    });
  });

  it.each([0, 20, 30, 28.251, NaN])(
    'rejects an invalid/non-exact amount (%s) before creating payment',
    async (amount) => {
      const f = fixture();
      await expect(
        f.createHistoricalPayment({ ...f.dto, amount }, 15, 7),
      ).rejects.toThrow('must equal');
      expect(f.paymentFactory.createPayment).not.toHaveBeenCalled();
      expect(f.sale.status).toBe('DRAFT');
    },
  );

  it('retries a completed checkout without creating another payment', async () => {
    const f = fixture();
    await f.createHistoricalPayment(f.dto, 15, 7);
    await expect(f.createHistoricalPayment(f.dto, 15, 7)).resolves.toMatchObject(
      { paymentId: 200, status: 'PAID' },
    );
    expect(f.paymentFactory.createPayment).toHaveBeenCalledTimes(1);
    expect(f.stock.stockQuantity).toBe(4);
    await expect(
      f.createHistoricalPayment({ ...f.dto, amount: 30 }, 15, 7),
    ).rejects.toThrow('different payment details');
  });

  it('refunds a paid sale with a negative payment and restores deducted stock once', async () => {
    const f = fixture();
    await f.createHistoricalPayment(f.dto, 15, 7);

    await expect(
      f.service.reverseTransaction(
        1,
        15,
        {
          type: PosTransactionReversalType.REFUND,
          reason: 'Customer returned the book',
        },
        8,
      ),
    ).resolves.toMatchObject({
      status: PosTransactionStatus.REFUNDED,
      reversalType: PosTransactionReversalType.REFUND,
      reversalReason: 'Customer returned the book',
      reversedByUserId: 8,
      refundPaymentId: 201,
    });

    expect(f.stock.stockQuantity).toBe(5);
    expect(f.payments).toHaveLength(2);
    expect(f.payments[0].isDeleted).toBe(0);
    expect(f.payments[1]).toMatchObject({
      id: 201,
      userId: 100,
      paymentMethodId: 4,
      amount: -28.25,
      balance: 0,
      createdByUserId: 8,
    });
    expect(f.payments[1].notes).toContain('Customer returned the book');

    const history = await f.service.getPaymentHistory(15);
    expect(history.data.body[0]).toMatchObject({
      status: PosTransactionStatus.REFUNDED,
      reversalType: PosTransactionReversalType.REFUND,
      reversalReason: 'Customer returned the book',
      refundPaymentId: 201,
      refundAmount: 28.25,
    });

    await expect(
      f.service.reverseTransaction(
        1,
        15,
        {
          type: PosTransactionReversalType.REFUND,
          reason: 'Duplicate request',
        },
        8,
      ),
    ).rejects.toThrow('Only a paid POS transaction');
    expect(f.stock.stockQuantity).toBe(5);
    expect(f.payments).toHaveLength(2);
  });

  it('stores the reversal audit instant separately from the Eastern refund payment date', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-21T06:09:12.000Z'));
      const f = fixture();
      await f.createHistoricalPayment(f.dto, 15, 7);

      vi.setSystemTime(new Date('2026-09-21T06:13:06.000Z'));
      await f.service.reverseTransaction(
        1,
        15,
        {
          type: PosTransactionReversalType.REFUND,
          reason: 'Customer returned the book',
        },
        8,
      );

      expect(f.sale.paidAt.toISOString()).toBe('2026-09-21T06:09:12.000Z');
      expect(f.sale.reversedAt).toEqual(new Date('2026-09-21T06:13:06.000Z'));
      expect(f.payments[1].date.toISOString()).toBe('2026-09-21T02:13:06.000Z');
    } finally {
      vi.useRealTimers();
    }
  });
  it('rolls back restored stock when refund payment creation fails', async () => {
    const f = fixture();
    await f.createHistoricalPayment(f.dto, 15, 7);
    f.paymentFactory.createPayment.mockRejectedValueOnce(
      new Error('refund payment failure'),
    );

    await expect(
      f.service.reverseTransaction(
        1,
        15,
        {
          type: PosTransactionReversalType.REFUND,
          reason: 'Customer returned the book',
        },
        8,
      ),
    ).rejects.toThrow('refund payment failure');

    expect(f.stock.stockQuantity).toBe(4);
    expect(f.sale).toMatchObject({
      status: PosTransactionStatus.PAID,
      refundPaymentId: null,
      reversalType: null,
    });
    expect(f.payments).toHaveLength(1);
  });

  it('voids a same-day paid sale, soft-deletes its payment and restores stock', async () => {
    const f = fixture();
    await f.createHistoricalPayment(f.dto, 15, 7);

    await expect(
      f.service.reverseTransaction(
        1,
        15,
        {
          type: PosTransactionReversalType.VOID,
          reason: 'Entered by mistake',
        },
        8,
      ),
    ).resolves.toMatchObject({
      status: PosTransactionStatus.VOIDED,
      reversalType: PosTransactionReversalType.VOID,
      refundPaymentId: null,
    });

    expect(f.stock.stockQuantity).toBe(5);
    expect(f.payments).toHaveLength(1);
    expect(f.payments[0]).toMatchObject({
      isDeleted: 1,
      updatedByUserId: 8,
    });
  });

  it('requires older paid sales to be refunded instead of voided', async () => {
    const f = fixture();
    await f.createHistoricalPayment(f.dto, 15, 7);
    f.payments[0].date = new Date('2020-01-01T12:00:00.000Z');

    await expect(
      f.service.reverseTransaction(
        1,
        15,
        {
          type: PosTransactionReversalType.VOID,
          reason: 'Too old to void',
        },
        8,
      ),
    ).rejects.toThrow('Record a refund instead');

    expect(f.stock.stockQuantity).toBe(4);
    expect(f.sale.status).toBe(PosTransactionStatus.PAID);
    expect(f.payments[0].isDeleted).toBe(0);
  });

  it('rolls back payment and sale when customer balance persistence fails', async () => {
    const f = fixture();
    f.balance.recalculateAndPersist.mockRejectedValueOnce(
      new Error('balance failure'),
    );
    await expect(f.createHistoricalPayment(f.dto, 15, 7)).rejects.toThrow(
      'balance failure',
    );
    expect(f.payments).toHaveLength(0);
    expect(f.stock.stockQuantity).toBe(5);
    expect(f.sale).toMatchObject({
      status: 'DRAFT',
      paymentId: null,
      paidAmount: 0,
    });
  });

  it('deducts the sold quantity and allows selling the exact remaining stock', async () => {
    const f = fixture();
    f.line.quantity = 2;
    f.stock.stockQuantity = 2;
    f.dto.amount = 56.5;

    await expect(f.createHistoricalPayment(f.dto, 15, 7)).resolves.toMatchObject(
      {
        status: 'PAID',
        paymentId: 200,
      },
    );
    expect(f.stock.stockQuantity).toBe(0);
  });

  it('rejects a sale that exceeds managed stock without creating a payment', async () => {
    const f = fixture();
    f.line.quantity = 2;
    f.stock.stockQuantity = 1;
    f.dto.amount = 56.5;

    await expect(f.createHistoricalPayment(f.dto, 15, 7)).rejects.toThrow(
      'Insufficient stock for Lesson Book: 1 available, 2 requested',
    );
    expect(f.stock.stockQuantity).toBe(1);
    expect(f.payments).toHaveLength(0);
    expect(f.sale.status).toBe(PosTransactionStatus.DRAFT);
  });

  it('rejects a tracked item whose stock quantity is missing', async () => {
    const f = fixture();
    f.stock.stockQuantity = null;

    await expect(f.createHistoricalPayment(f.dto, 15, 7)).rejects.toThrow(
      'Stock is not configured for Lesson Book',
    );
    expect(f.payments).toHaveLength(0);
    expect(f.sale.status).toBe(PosTransactionStatus.DRAFT);
  });
  it('keeps items with inventory tracking disabled unmanaged', async () => {
    const f = fixture();
    f.stock.trackInventory = false;

    await expect(f.createHistoricalPayment(f.dto, 15, 7)).resolves.toMatchObject(
      {
        status: 'PAID',
      },
    );
    expect(f.stockRepo.save).not.toHaveBeenCalled();
  });
  it.each(['inactive', 'deleted', 'other location', 'missing'])(
    'rejects checkout containing an %s item',
    async (reason) => {
      const f = fixture();
      if (reason === 'inactive') f.item.status = 0;
      if (reason === 'deleted') f.item.isDeleted = true;
      if (reason === 'other location') f.item.locationId = 9;
      if (reason === 'missing') f.line.item = null as any;
      await expect(f.createHistoricalPayment(f.dto, 15, 7)).rejects.toThrow(
        'unavailable',
      );
      expect(f.payments).toHaveLength(0);
      expect(f.stock.stockQuantity).toBe(5);
    },
  );

  it.each(['PAID', 'CANCELED'])('does not mutate a %s cart', async (status) => {
    const f = fixture();
    f.sale.status = status as PosTransactionStatus;
    await expect(
      f.service.updateLineItem(1, 20, { quantity: 2 }, 15),
    ).rejects.toThrow('non-DRAFT');
    expect(f.line.quantity).toBe(1);
  });

  it('rejects an inactive payment method and credit transfer methods', async () => {
    const f = fixture();
    f.method.active = 0;
    await expect(f.createHistoricalPayment(f.dto, 15, 7)).rejects.toThrow(
      'active payment method',
    );
    f.method.active = 1;
    f.method.id = PaymentMethod.TYPE_CREDIT_APPLIED;
    await expect(
      f.createHistoricalPayment(
        { ...f.dto, paymentMethodId: f.method.id },
        15,
        7,
      ),
    ).rejects.toThrow('existing credit');
  });

  it('rejects wrong-location reads and every mutation', async () => {
    const f = fixture();
    const calls = [
      () => f.service.getTransaction(1, 9),
      () => f.service.addLineItem(1, { itemId: 10, quantity: 1 }, 9),
      () => f.service.updateLineItem(1, 20, { quantity: 2 }, 9),
      () => f.service.removeLineItem(1, 20, 9),
      () => f.service.updateCustomer(1, { customerId: 100 }, 9),
      () => f.service.cancelTransaction(1, 9, 7),
      () => f.service.applyDiscount(1, 1, 9),
      () => f.createHistoricalPayment(f.dto, 9, 7),
    ];
    for (const call of calls)
      await expect(call()).rejects.toThrow('not found for this location');
    expect(f.saleRepo.save).not.toHaveBeenCalled();
    expect(f.paymentFactory.createPayment).not.toHaveBeenCalled();
  });

  it('does not allow an item from another location into a draft', async () => {
    const f = fixture();
    f.item.locationId = 9;
    await expect(
      f.service.addLineItem(1, { itemId: 10, quantity: 1 }, 15),
    ).rejects.toThrow('not found');
  });

  it('retains compatibility with an unallocated payment from the previous web client', async () => {
    const f = fixture();
    f.payments.push(
      Object.assign(new Payment(), {
        id: 300,
        userId: 100,
        amount: 28.25,
        balance: 28.25,
        paymentMethodId: 4,
        isDeleted: 0,
      }),
    );
    await expect(
      f.createHistoricalPayment({ ...f.dto, paymentId: 300 }, 15, 7),
    ).resolves.toMatchObject({ paymentId: 300, status: 'PAID' });
    expect(f.payments[0].balance).toBe(0);
    expect(f.paymentFactory.createPayment).not.toHaveBeenCalled();
  });
});


describe('POS invoice checkout', () => {
  function invoiceFixture() {
    const f = fixture();
    const invoice = { id: 500, invoiceNumber: 123, userId: 0, walkinBuyerName: null };
    const creator = { createTransaction: vi.fn().mockResolvedValue(1), getNextInvoiceNumber: vi.fn().mockResolvedValue(123),
      createBlankInvoice: vi.fn(async (_tx, customerId) => Object.assign(invoice, { userId: customerId })) };
    const lines = { audit: vi.fn(), addInTransaction: vi.fn().mockResolvedValue({ id: 51, unit: 1, amount: 25 }),
      priceLine: vi.fn(), recalculate: vi.fn() };
    Object.assign(f.service, { invoiceCreator: creator, invoiceLines: lines });
    f.manager.findOneBy = vi.fn().mockResolvedValue(f.walkInCustomer);
    f.manager.findOneByOrFail = vi.fn().mockResolvedValue(invoice);
    f.sale.discountAmount = 0;
    return { ...f, creator, lines, invoice };
  }
  it('creates one invoice, no payment, and returns the same invoice on retry', async () => {
    const f = invoiceFixture();
    const first = await f.service.createInvoice(1, 15, 'training-location', 7);
    const retry = await f.service.createInvoice(1, 15, 'training-location', 7);
    expect(first).toEqual({ invoiceId: 500, invoiceNumber: 'I-00123' });
    expect(retry).toEqual(first);
    expect(f.creator.createBlankInvoice).toHaveBeenCalledTimes(1);
    expect(f.lines.addInTransaction).toHaveBeenCalledTimes(1);
    expect(f.saleRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1, locationId: 15 }, lock: { mode: 'pessimistic_write' } }));
    expect(f.sale).toMatchObject({ status: 'INVOICED', invoiceId: 500, customerId: 100 });
    expect(f.payments).toHaveLength(0);
  });
  it('uses only the mapped customer for walk-in and keeps the per-invoice buyer name', async () => {
    const f = invoiceFixture();
    f.sale.isWalkIn = true;
    f.sale.customerId = null;
    f.sale.customerInfo = 'Jamie Lee';
    await f.service.createInvoice(1, 15, 'training-location', 7);
    expect(f.invoice).toMatchObject({ userId: 900, walkinBuyerName: 'Jamie Lee' });
    expect(f.sale.customerId).toBe(900);
  });
  it('does not rename or reassign a named customer to the walk-in record', async () => {
    const f = invoiceFixture();
    f.sale.customerInfo = 'Named Buyer';
    await f.service.createInvoice(1, 15, 'training-location', 7);
    expect(f.invoice).toMatchObject({ userId: 100, walkinBuyerName: null });
  });
  it('leaves checkout draft when invoice line stock validation fails', async () => {
    const f = invoiceFixture();
    f.lines.addInTransaction.mockRejectedValue(new Error('Insufficient stock'));
    await expect(f.service.createInvoice(1, 15, 'training-location', 7)).rejects.toThrow('Insufficient stock');
    expect(f.sale.status).toBe('DRAFT');
    expect(f.sale.invoiceId).toBeUndefined();
    expect(f.payments).toHaveLength(0);
    expect(f.lines.recalculate).not.toHaveBeenCalled();
  });
});
