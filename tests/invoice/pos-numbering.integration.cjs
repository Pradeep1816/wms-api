// Explicit opt-in. Only the isolated invoice fixture is committed; it is removed in finally.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DataSource } = require('typeorm');
const { AppDataSource } = require('../../dist/config/data-source');
const { Invoice } = require('../../dist/invoice/entities/invoice.entity');
const { InvoiceCreateRepository } = require('../../dist/invoice/repositories/invoice-create.repository');
const { ReceivePaymentRepository } = require('../../dist/invoice/repositories/receive-payment.repository');
const { InvoiceReturnRepository } = require('../../dist/invoice/repositories/invoice-return.repository');

test('invoice numbering reads a concurrently committed invoice after an earlier transaction snapshot', async () => {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.ok(process.env.SMW_POS_TEST_DATABASE);
  assert.equal(AppDataSource.options.database, process.env.SMW_POS_TEST_DATABASE);
  assert.match(process.env.SMW_POS_TEST_DATABASE, /^smw_(?:sep_23|may_4|[a-z0-9_]*test[a-z0-9_]*)$/);
  const db = new DataSource({ ...AppDataSource.options, logging: false });
  await db.initialize();
  const reader = db.createQueryRunner();
  let fixtureId;
  try {
    await reader.connect();
    await reader.startTransaction('REPEATABLE READ');
    const [location] = await reader.query("SELECT id FROM location WHERE slug='training-location' AND isDeleted=0");
    const template = await reader.manager.findOneOrFail(Invoice, { where: { locationId: location.id, type: 2 }, order: { id: 'DESC' } });
    const fixture = await db.transaction(async manager => {
      await manager.query('SELECT id FROM location WHERE id=? FOR UPDATE', [location.id]);
      return manager.save(Invoice, manager.create(Invoice, { ...template, id: undefined, invoiceNumber: template.invoiceNumber + 1,
        notes: 'SMW991 isolated numbering regression', posReturnRequestKey: null }));
    });
    fixtureId = fixture.id;
    for (const repository of [new InvoiceCreateRepository(), new InvoiceReturnRepository(), new ReceivePaymentRepository()]) {
      assert.equal(await repository.getNextInvoiceNumber(location.id, 2, reader.manager), fixture.invoiceNumber + 1,
        'A stale REPEATABLE READ snapshot must not reuse a number committed by another request');
    }
  } finally {
    if (reader.isTransactionActive) await reader.rollbackTransaction();
    await reader.release();
    if (fixtureId) await db.getRepository(Invoice).delete(fixtureId);
    await db.destroy();
  }
});
