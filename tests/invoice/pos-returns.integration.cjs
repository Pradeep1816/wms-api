// Run after yarn build with NODE_ENV=test and SMW_POS_TEST_DATABASE=<local dump>.
// No schema sync, HTTP server, cron or SMTP. All writes roll back, including on failure.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { DataSource, In } = require('typeorm');
const { AppDataSource } = require('../../dist/config/data-source');
const { Invoice } = require('../../dist/invoice/entities/invoice.entity');
const { InvoiceLineItem } = require('../../dist/invoice/entities/invoice-line-item.entity');
const { InvoicePayment } = require('../../dist/invoice/entities/invoice-payment.entity');
const { InvoiceReverse } = require('../../dist/invoice/entities/invoice-reverse.entity');
const { Item } = require('../../dist/item/entities/item.entity');
const { ItemLocationStock } = require('../../dist/item/entities/item-location-stock.entity');
const { Payment } = require('../../dist/payment/entities/payment.entity');
const { RoyaltyTransaction } = require('../../dist/payment/entities/royalty-transaction.entity');
const { InvoicePosReturnsService } = require('../../dist/invoice/services/invoice-pos-returns.service');
const { InvoicePosLinesService } = require('../../dist/invoice/services/invoice-pos-lines.service');
const { InvoicePosStockService } = require('../../dist/invoice/services/invoice-pos-stock.service');
const { InvoiceCreateRepository } = require('../../dist/invoice/repositories/invoice-create.repository');
const { InvoiceReturnRepository } = require('../../dist/invoice/repositories/invoice-return.repository');
const { InvoiceDiscountCalculator } = require('../../dist/invoice/services/calculations/invoice-discount.calculator');
const { InvoiceReturnRoyaltyService } = require('../../dist/invoice/services/invoice-return-royalty.service');
const { RoyaltyLedgerService } = require('../../dist/payment/services/royalty-ledger.service');
const { RoyaltyTransactionRepository } = require('../../dist/payment/repositories/royalty-transaction.repository');
const { PaymentRoyaltyRecognitionRepository } = require('../../dist/payment/repositories/payment-royalty-recognition.repository');

for (const paid of [true, false]) {
  for (const quantity of [1, 3]) {
    test(`${paid ? 'paid' : 'unpaid'} ${quantity === 1 ? 'partial' : 'full'} POS return survives entity saves and retries without duplicate effects`, async () => {
      assert.equal(process.env.NODE_ENV, 'test');
      assert.ok(process.env.SMW_POS_TEST_DATABASE, 'Explicit test database required');
      assert.equal(AppDataSource.options.database, process.env.SMW_POS_TEST_DATABASE);
      assert.match(process.env.SMW_POS_TEST_DATABASE, /^smw_(?:sep_23|may_4|[a-z0-9_]*test[a-z0-9_]*)$/);
      const db = new DataSource({ ...AppDataSource.options, synchronize: false, migrationsRun: false, logging: false });
      await db.initialize();
      const runner = db.createQueryRunner();
      let itemId;
      try {
        await runner.connect();
        await runner.startTransaction();
        const m = runner.manager;
        const [location] = await m.query("SELECT id FROM location WHERE slug='training-location' AND isDeleted=0");
        assert.ok(location, 'Training fixture location required');
        const template = await m.findOneByOrFail(Invoice, { locationId: location.id, type: 2, isDeleted: false });
        const source = await m.findOneByOrFail(Item, { locationId: location.id, isDeleted: false });
        const actor = template.createdUserId;
        const item = await m.save(Item, m.create(Item, {
          locationId: location.id, itemCategoryId: source.itemCategoryId,
          code: 'SMW991-RETURN-TEST', description: 'Rollback-only return retry fixture',
          price: 10, royaltyFree: 0, taxStatusId: source.taxStatusId, status: 1, isDeleted: false,
        }));
        itemId = item.id;
        await m.save(ItemLocationStock, m.create(ItemLocationStock, {
          itemId, locationId: location.id, trackInventory: true, stockQuantity: 7, lowStockQuantity: null,
        }));
        const invoice = await m.save(Invoice, m.create(Invoice, {
          ...template, id: undefined, invoiceNumber: 2147483000, posReturnRequestKey: null,
          subTotal: 30, tax: 3.9, total: 33.9, balance: paid ? 0 : 33.9,
          status: paid ? Invoice.STATUS_PAID : Invoice.STATUS_OWING,
          isVoid: 0, isCanceled: false, isPosted: 0, isTaxAdjusted: 0,
          notes: 'SMW991 rollback-only return retry fixture',
        }));
        const line = await m.save(InvoiceLineItem, m.create(InvoiceLineItem, {
          invoiceId: invoice.id, itemId, itemTypeId: 3, code: item.code, description: item.description,
          unit: 3, amount: 10, netTotal: 30, taxRate: 3.9, taxType: 'HST', taxStatus: 'Taxable', taxCode: 'HST',
          royaltyFree: 0, royaltyCategoryId: source.itemCategoryId, royaltyRateApplied: 6, advertisementRateApplied: 5,
          isDeleted: false, isPos: true, inventoryQuantityDeducted: 3, returnedQuantity: 0,
          posSnapshot: { code: item.code, upcCode: null, description: item.description,
            categoryId: source.itemCategoryId, categoryName: 'Return fixture', taxPercent: 13 },
        }));
        if (paid) {
          const payment = await m.save(Payment, m.create(Payment, {
            userId: invoice.userId, paymentMethodId: 4, amount: 33.9, balance: 0, date: invoice.date,
            isDeleted: 0, createdByUserId: actor, updatedByUserId: actor,
          }));
          const allocation = await m.save(InvoicePayment, m.create(InvoicePayment, {
            invoiceId: invoice.id, paymentId: payment.id, amount: 33.9, date: invoice.date,
            isDeleted: 0, createdByUserId: actor, updatedByUserId: actor,
          }));
          await m.save(RoyaltyTransaction, m.create(RoyaltyTransaction, {
            paymentId: payment.id, originalPaymentId: payment.id, customerId: invoice.userId, locationId: location.id,
            itemCategoryId: source.itemCategoryId, categoryName: 'Return fixture', rateApplied: 6,
            advertisementRateApplied: 5, royaltyAmount: 1.8, advertisementAmount: 1.5,
            paymentAmount: 33.9, revenueAmount: 30, taxAmount: 3.9, royaltyFree: false, isPos: true,
            eventType: 'PAYMENT_RECEIVED', sourceType: 'INVOICE_PAYMENT', sourceId: allocation.id,
            effectiveDate: invoice.date, schemaVersion: 2, idempotencyKey: `return-fixture:${randomUUID()}`,
          }));
        }
        // Pin service transactions to a real MySQL savepoint under the outer rollback.
        // Only permission lookup and customer-wide recalculation/cache are stubbed;
        // invoice/credit/payment/stock/royalty persistence uses real implementations.
        let balanceCalls = 0;
        const makeService = () => new InvoicePosReturnsService(
          { transaction: run => m.transaction(run) },
          new InvoicePosLinesService(), new InvoicePosStockService(),
          new InvoiceReturnRepository(new InvoiceDiscountCalculator()), new InvoiceCreateRepository(),
          new InvoiceReturnRoyaltyService(new RoyaltyLedgerService(new RoyaltyTransactionRepository()), new PaymentRoyaltyRecognitionRepository()),
          { getUserPermissions: async () => ['manageInvoices'] },
          { recalculateAndPersist: async () => { balanceCalls++; } },
        );
        const request = { requestId: randomUUID(), reason: 'Retry regression', lines: [{ lineItemId: line.id, quantity }] };
        const first = await makeService().returnItems(location.id, 'training-location', invoice.id, request, actor);
        const credit = await m.findOneByOrFail(Invoice, { id: first.creditInvoiceId });
        assert.equal(credit.posReturnRequestKey, `pos-return:${invoice.id}:${request.requestId}`,
          'Final totals save must preserve the replay key in MySQL');
        const returnedAmount = Math.round(1130 * quantity) / 100;
        assert.equal(Number(credit.total), -returnedAmount);
        assert.equal(Number(credit.balance), paid ? -returnedAmount : 0);
        assert.equal(Number((await m.findOneByOrFail(Invoice, { id: invoice.id })).balance), paid ? 0 : (3390 - 1130 * quantity) / 100);
        assert.equal((await m.findOneByOrFail(ItemLocationStock, { itemId })).stockQuantity, 7 + quantity);
        const capture = async () => ({
          invoices: await m.find(Invoice, { where: { id: In([invoice.id, credit.id]) }, order: { id: 'ASC' } }),
          lines: await m.find(InvoiceLineItem, { where: { itemId }, order: { id: 'ASC' } }),
          reversals: await m.findBy(InvoiceReverse, { invoiceId: invoice.id }),
          allocations: await m.find(InvoicePayment, { where: { invoiceId: In([invoice.id, credit.id]) }, order: { id: 'ASC' } }),
          ledger: await m.find(RoyaltyTransaction, { where: { sourceType: 'INVOICE_RETURN', sourceId: credit.id }, order: { id: 'ASC' } }),
          stock: await m.findOneByOrFail(ItemLocationStock, { itemId }), balanceCalls,
        });
        const before = await capture();
        assert.equal(before.reversals.length, 1);
        assert.equal(before.allocations.length, paid ? 1 : 2);
        assert.equal(before.ledger.length, paid ? 2 : 0);
        for (let retry = 0; retry < 2; retry++) {
          assert.deepEqual(await makeService().returnItems(location.id, 'training-location', invoice.id, request, actor), first);
          assert.deepEqual(await capture(), before, 'Retry must not change stock, credit allocations, royalty or balances');
        }
        if (quantity === 1) {
          const finalRequest = { ...request, requestId: randomUUID(), lines: [{ lineItemId: line.id, quantity: 2 }] };
          const final = await makeService().returnItems(location.id, 'training-location', invoice.id, finalRequest, actor);
          assert.notEqual(final.creditInvoiceId, first.creditInvoiceId, 'A distinct return of remaining goods is allowed');
          assert.deepEqual(await makeService().returnItems(location.id, 'training-location', invoice.id, finalRequest, actor), final);
          assert.deepEqual(await makeService().returnItems(location.id, 'training-location', invoice.id, request, actor), first);
          assert.equal((await m.findOneByOrFail(ItemLocationStock, { itemId })).stockQuantity, 10);
          assert.equal((await m.findOneByOrFail(InvoiceLineItem, { id: line.id })).returnedQuantity, 3);
          assert.equal(await m.countBy(InvoiceReverse, { invoiceId: invoice.id }), 2);
        }
      } finally {
        try {
          if (runner.isTransactionActive) await runner.rollbackTransaction();
          await runner.release();
          if (itemId) assert.equal(await db.getRepository(Item).countBy({ id: itemId }), 0, 'Fixture must roll back');
        } finally {
          await db.destroy();
        }
      }
    });
  }
}
