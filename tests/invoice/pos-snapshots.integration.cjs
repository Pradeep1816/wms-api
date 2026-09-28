// Explicit opt-in; every fixture and mutation rolls back. No HTTP, cron or SMTP.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DataSource } = require('typeorm');
const { AppDataSource } = require('../../dist/config/data-source');
const { Item } = require('../../dist/item/entities/item.entity');
const { ItemCategory } = require('../../dist/item/entities/item-category.entity');
const { ItemLocationStock } = require('../../dist/item/entities/item-location-stock.entity');
const { LocationCategoryRoyalty } = require('../../dist/location/entities/location-category-royalty.entity');
const { Invoice } = require('../../dist/invoice/entities/invoice.entity');
const { InvoiceLineItem } = require('../../dist/invoice/entities/invoice-line-item.entity');
const { InvoicePosLinesService } = require('../../dist/invoice/services/invoice-pos-lines.service');
const { InvoicePosStockService } = require('../../dist/invoice/services/invoice-pos-stock.service');
const { InvoiceLineItemCreateTransformationService } = require('../../dist/invoice/services/transformations/invoice-line-item-create-transformation.service');
const { InvoiceDiscountCalculator } = require('../../dist/invoice/services/calculations/invoice-discount.calculator');

test('invoice saves preserve snapshots and new scans use changed catalog settings', async () => {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.ok(process.env.SMW_POS_TEST_DATABASE);
  assert.equal(AppDataSource.options.database, process.env.SMW_POS_TEST_DATABASE);
  assert.match(process.env.SMW_POS_TEST_DATABASE, /^smw_(?:sep_23|may_4|[a-z0-9_]*test[a-z0-9_]*)$/);
  const db = new DataSource({ ...AppDataSource.options, logging: false });
  await db.initialize();
  const runner = db.createQueryRunner();
  await runner.connect(); await runner.startTransaction();
  let fixtureId;
  try {
    const m = runner.manager;
    const [location] = await m.query("SELECT id FROM location WHERE slug='training-location' AND isDeleted=0");
    const template = await m.findOneByOrFail(Invoice, { locationId: location.id, type: 2, isDeleted: false });
    const source = await m.findOneByOrFail(Item, { locationId: location.id, isDeleted: false, status: 1 });
    const category = await m.save(ItemCategory, m.create(ItemCategory, { name: 'SMW991 snapshot fixture', royality: 0, isDeleted: false }));
    const rate = await m.save(LocationCategoryRoyalty, m.create(LocationCategoryRoyalty, { locationId: location.id, itemCategoryId: category.id, royality: 4, advertisement: 0 }));
    const item = await m.save(Item, m.create(Item, { locationId: location.id, itemCategoryId: category.id, code: 'LESSON', description: 'Original book',
      price: 12.34, taxStatusId: source.taxStatusId, royaltyFree: 0, status: 1, isDeleted: false }));
    fixtureId = item.id;
    await m.save(ItemLocationStock, m.create(ItemLocationStock, { itemId: item.id, locationId: location.id, trackInventory: true, stockQuantity: 10, lowStockQuantity: 9 }));
    const invoice = await m.save(Invoice, m.create(Invoice, { ...template, id: undefined, invoiceNumber: 2147483000, subTotal: 0, total: 0, tax: 0,
      balance: 0, isVoid: 0, isCanceled: false, isPosted: false, isTaxAdjusted: 0, posReturnRequestKey: null }));
    const stock = new InvoicePosStockService();
    const service = new InvoicePosLinesService(db, new InvoiceLineItemCreateTransformationService(new InvoiceDiscountCalculator()), stock, {}, {});
    const first = await service.addInTransaction(m, invoice, item.id, 2, false);
    assert.equal(first.isPos, true, 'A school book called LESSON must not become a lesson charge');
    assert.equal(Number(first.royaltyRateApplied), 4);
    assert.equal(Number(first.advertisementRateApplied), 0, 'Explicit zero is retained');
    assert.equal(Number(first.netTotal), 24.68);
    assert.equal((await m.findOneByOrFail(ItemLocationStock, { itemId: item.id, locationId: location.id })).stockQuantity, 8);
    await m.update(Item, item.id, { description: 'Renamed book', price: 20, royaltyFree: 1 });
    await m.update(ItemCategory, category.id, { name: 'Renamed category' });
    await m.update(LocationCategoryRoyalty, rate.id, { royality: 9, advertisement: 8 });
    const second = await service.addInTransaction(m, invoice, item.id, 1, false);
    const saved = await m.findOneByOrFail(InvoiceLineItem, { id: first.id });
    assert.equal(saved.posSnapshot.description, 'Original book');
    assert.equal(saved.posSnapshot.categoryName, 'SMW991 snapshot fixture');
    assert.equal(Number(saved.amount), 12.34);
    assert.equal(Number(saved.royaltyRateApplied), 4);
    assert.equal(Number(saved.advertisementRateApplied), 0);
    assert.equal(Number(saved.royaltyFree), 0);
    assert.equal(second.posSnapshot.categoryName, 'Renamed category');
    assert.equal(Number(second.amount), 20);
    assert.equal(Number(second.royaltyFree), 1);
    assert.equal(Number(second.royaltyRateApplied), 0);
    assert.equal(Number(second.advertisementRateApplied), 0);
    // Same-day return before payment: dates alone cannot establish event order.
    // Recognition already uses the remaining goods, so historical return fallback
    // must not subtract the returned book from that payment a second time.
    const { Payment } = require('../../dist/payment/entities/payment.entity');
    const { InvoicePayment } = require('../../dist/invoice/entities/invoice-payment.entity');
    const { RoyaltyTransaction } = require('../../dist/payment/entities/royalty-transaction.entity');
    const { PaymentBasedRoyaltyReportRepository } = require('../../dist/report/repositories/payment-based-royalty-report.repository');
    const date = new Date('2026-09-24T00:00:00Z');
    const tax = Math.round(Number(first.taxRate) * 100) / 100;
    const halfTax = Math.round(tax * 50) / 100;
    const amount = 12.34 + halfTax;
    await m.update(InvoiceLineItem, second.id, { isDeleted: true });
    await m.update(InvoiceLineItem, first.id, { returnedQuantity: 1 });
    await m.update(Invoice, invoice.id, { subTotal: 24.68, tax, total: 24.68 + tax });
    const credit = await m.save(Invoice, m.create(Invoice, { ...invoice, id: undefined, invoiceNumber: 2147483001, date,
      subTotal: -12.34, tax: -halfTax, total: -amount, balance: 0 }));
    await m.save(InvoiceLineItem, m.create(InvoiceLineItem, { ...first, id: undefined, invoiceId: credit.id,
      unit: -1, netTotal: -12.34, taxRate: -halfTax, returnedFromLineItemId: first.id, returnedQuantity: 0, inventoryQuantityDeducted: 0 }));
    await m.query('UPDATE invoice SET date=? WHERE id=?', ['2026-09-24 00:00:00', credit.id]);
    await m.query('INSERT INTO invoice_reverse (invoiceId,reversedInvoiceId) VALUES (?,?)', [invoice.id,credit.id]);
    const beforeReport = await new PaymentBasedRoyaltyReportRepository({ manager: m }).getPaymentBasedRoyaltyData([location.id], '2026-09-24', '2026-09-24');
    const payment = await m.save(Payment, m.create(Payment, { userId: invoice.userId, paymentMethodId: 4, amount, date,
      isDeleted: 0, balance: 0, createdByUserId: template.createdUserId || 727, updatedByUserId: template.updatedUserId || 727 }));
    const allocation = await m.save(InvoicePayment, m.create(InvoicePayment, { invoiceId: invoice.id, paymentId: payment.id, amount,
      date, isDeleted: 0, createdByUserId: 727, updatedByUserId: 727, posPurposeSnapshot: { amount, purposes: [] } }));
    await m.save(RoyaltyTransaction, m.create(RoyaltyTransaction, { paymentId: payment.id, locationId: location.id,
      customerId: invoice.userId, itemCategoryId: category.id, categoryName: first.posSnapshot.categoryName, rateApplied: 4,
      advertisementRateApplied: 0, advertisementAmount: 0, paymentAmount: amount, revenueAmount: 12.34, taxAmount: halfTax,
      schemaVersion: 2, royaltyAmount: 0.49, royaltyFree: false, isPos: true, eventType: 'PAYMENT_RECEIVED', sourceType: 'INVOICE_PAYMENT',
      sourceId: allocation.id, effectiveDate: date, idempotencyKey: `SMW991-rollback-${payment.id}` }));
    const report = await new PaymentBasedRoyaltyReportRepository({ manager: m }).getPaymentBasedRoyaltyData([location.id], '2026-09-24', '2026-09-24');
    const rows = report.categoryRows.filter(row => row.categoryId === category.id);
    assert.equal(rows.length, 1, 'The pre-payment return must not add a second fallback row');
    assert.equal(rows[0].type, 'POS');
    assert.equal(rows[0].revenue, 12.34);
    assert.equal(rows[0].royalty, 0.49);
    const reportTax = report.amounts.find(row => row.locationId === location.id)?.tax || 0;
    const beforeTax = beforeReport.amounts.find(row => row.locationId === location.id)?.tax || 0;
    assert.equal(Math.round((reportTax - beforeTax) * 100) / 100, halfTax, 'Tax is recognized once, without the unpaid return fallback');
    await stock.restoreAll(m, location.id, first);
    await stock.restoreAll(m, location.id, second);
    assert.equal((await m.findOneByOrFail(ItemLocationStock, { itemId: item.id, locationId: location.id })).stockQuantity, 10);
  } finally {
    await runner.rollbackTransaction(); await runner.release();
    if (fixtureId) assert.equal(await db.getRepository(Item).countBy({ id: fixtureId }), 0);
    await db.destroy();
  }
});
