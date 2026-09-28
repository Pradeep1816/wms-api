// Run explicitly after `yarn build` and applying the outbox migration:
// SMW_LOW_STOCK_TEST_DATABASE=smw_sep_23 node --test tests/item/low-stock-alert.integration.cjs
// All fixtures and stock changes are rolled back. Email is an in-memory sink.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DataSource } = require('typeorm');
const { AppDataSource } = require('../../dist/config/data-source');
const { Item } = require('../../dist/item/entities/item.entity');
const { ItemLocationStock } = require('../../dist/item/entities/item-location-stock.entity');
const { LowStockAlert } = require('../../dist/item/entities/low-stock-alert.entity');
const { ItemRepository } = require('../../dist/item/repositories/item.repository');
const { PosTransactionService } = require('../../dist/pos/pos-transaction.service');
const { LowStockEmailCronService } = require('../../dist/cron/services/low-stock-email-cron.service');
const { CronLockService } = require('../../dist/cron/services/cron-lock.service');

test('real MySQL stock movements, outbox isolation, delivery and rollback', async () => {
  assert.ok(process.env.SMW_LOW_STOCK_TEST_DATABASE, 'Explicit development test database is required');
  assert.equal(AppDataSource.options.database, process.env.SMW_LOW_STOCK_TEST_DATABASE);
  assert.notEqual(process.env.NODE_ENV, 'production');
  const db = new DataSource({ ...AppDataSource.options, logging: false });
  await db.initialize();
  const runner = db.createQueryRunner();
  let itemId;
  try {
    await runner.connect();
    await runner.startTransaction();
    const manager = runner.manager;
    const locations = await manager.query("SELECT id FROM location WHERE slug IN ('training-location','burlington') AND isDeleted=0 ORDER BY id");
    assert.equal(locations.length, 2);
    const source = await manager.getRepository(Item).findOneByOrFail({ isDeleted: false });
    const item = await manager.getRepository(Item).save(manager.getRepository(Item).create({
      itemCategoryId: source.itemCategoryId, locationId: 0, code: 'SMW991-OUTBOX-QA',
      description: 'Low-stock rollback fixture', price: 1, royaltyFree: 0,
      taxStatusId: source.taxStatusId, status: 1, isDeleted: false,
    }));
    itemId = item.id;
    const stockRepository = manager.getRepository(ItemLocationStock);
    const items = new ItemRepository(manager.getRepository(Item), stockRepository);
    const alerts = manager.getRepository(LowStockAlert);
    const update = (locationId, quantity) => items.updateItemStock(item.id, locationId,
      { trackInventory: true, stockQuantity: quantity, lowStockQuantity: 9 });
    const locationId = locations[0].id;
    await update(locationId, 10);
    assert.equal(await alerts.countBy({ itemId }), 0);

    // Execute the production stock deduction path against real row locks.
    const pos = new PosTransactionService({ manager });
    const sale = { locationId, lineItems: [{ itemId, quantity: 2, item }] };
    await pos.deductManagedStock(sale);
    assert.equal((await stockRepository.findOneByOrFail({ itemId, locationId })).stockQuantity, 8);
    assert.equal(sale.lineItems[0].inventoryQuantityDeducted, 2);
    assert.equal(await alerts.countBy({ itemId }), 1);
    // An independent connection cannot deliver an event before sale commit.
    assert.equal(await db.getRepository(LowStockAlert).countBy({ itemId }), 0);
    await update(locationId, 7);
    assert.equal(await alerts.countBy({ itemId }), 1);
    await pos.restoreManagedStock(sale);
    assert.equal((await stockRepository.findOneByOrFail({ itemId, locationId })).stockQuantity, 9);
    await pos.deductManagedStock({ locationId, lineItems: [{ itemId, quantity: 1, item }] });
    assert.equal(await alerts.countBy({ itemId }), 2);

    // Roll back a savepoint after queuing to prove stock/event atomicity.
    await runner.startTransaction();
    await update(locationId, 10);
    await update(locationId, 8);
    assert.equal(await alerts.countBy({ itemId }), 3);
    await runner.rollbackTransaction();
    assert.equal(await alerts.countBy({ itemId }), 2);
    assert.equal((await stockRepository.findOneByOrFail({ itemId, locationId })).stockQuantity, 8);

    await update(locations[1].id, 2);
    const captured = [];
    for (const [index, location] of locations.entries()) {
      await manager.query('UPDATE location SET email=? WHERE id=?', [`smw991-qa-${index}@example.com`, location.id]);
    }
    const worker = new LowStockEmailCronService({ getRepository: (entity) => manager.getRepository(entity) },
      { sendEmail: async (message) => { captured.push(message); } }, {});
    for (const alert of await alerts.findBy({ itemId })) await worker.deliver(alert);
    assert.equal(captured.length, 3);
    assert.deepEqual(new Set(captured.flatMap(m => m.to)), new Set(['smw991-qa-0@example.com', 'smw991-qa-1@example.com']));
    assert.equal(await alerts.countBy({ itemId, status: 'sent' }), 3);

    // Independent worker/lock-service instances use different real MySQL lock
    // connections. Scope data reads/writes to rollback fixtures only, so this
    // test cannot process another developer's queued alerts.
    await update(locationId, 10);
    await update(locationId, 8);
    const pending = await alerts.findOneByOrFail({ itemId, status: 'pending' });
    const scopedDataSource = { getRepository: (entity) => entity !== LowStockAlert
      ? manager.getRepository(entity)
      : {
          find: (options) => alerts.find({ ...options, where: { ...options.where, itemId } }),
          update: (criteria, values) => alerts.update(
            typeof criteria === 'number' ? { id: criteria, itemId } : { ...criteria, itemId }, values),
        } };
    let releaseSend;
    let signalSend;
    const sending = new Promise(resolve => { signalSend = resolve; });
    const sendGate = new Promise(resolve => { releaseSend = resolve; });
    const mailSink = { sendEmail: async (message) => {
      captured.push(message); signalSend(); await sendGate;
    } };
    const workerA = new LowStockEmailCronService(scopedDataSource, mailSink, new CronLockService(db));
    const workerB = new LowStockEmailCronService(scopedDataSource, mailSink, new CronLockService(db));
    const firstRun = workerA.runScheduled();
    try {
      await Promise.race([sending, firstRun.then(() => { throw new Error('Worker ended before sending'); })]);
      assert.equal((await alerts.findOneByOrFail({ id: pending.id })).status, 'sending');
      assert.equal(await workerB.runScheduled(), null, 'Second instance must skip the locked run');
      assert.equal((await alerts.findOneByOrFail({ id: pending.id })).status, 'sending', 'Second instance must not change an in-flight send to review');
      assert.equal(captured.length, 4, 'Exactly one new email while both workers trigger');
    } finally {
      releaseSend();
      await firstRun;
    }
    assert.equal((await alerts.findOneByOrFail({ id: pending.id })).status, 'sent');
    assert.deepEqual(await workerB.runScheduled(), { processed: 0 }, 'Lock releases and completed messages are not resent');
    assert.equal(captured.length, 4);
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    if (itemId) {
      assert.equal(await db.getRepository(Item).countBy({ id: itemId }), 0);
      assert.equal(await db.getRepository(LowStockAlert).countBy({ itemId }), 0);
    }
    await db.destroy();
  }
});
