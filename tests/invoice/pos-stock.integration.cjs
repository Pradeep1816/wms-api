// Explicit opt-in: NODE_ENV=test SMW_POS_TEST_DATABASE=<local dump> node --test tests/invoice/pos-stock.integration.cjs
// No schema sync, HTTP server, cron worker or SMTP. Only isolated fixture rows are committed and removed.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DataSource } = require('typeorm');
const { AppDataSource } = require('../../dist/config/data-source');
const { Item } = require('../../dist/item/entities/item.entity');
const { ItemLocationStock } = require('../../dist/item/entities/item-location-stock.entity');
const { LowStockAlert } = require('../../dist/item/entities/low-stock-alert.entity');
const { InvoicePosStockService } = require('../../dist/invoice/services/invoice-pos-stock.service');

test('invoice inventory serializes concurrent purchases and rolls stock/outbox back together', async () => {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.ok(process.env.SMW_POS_TEST_DATABASE, 'Explicit test database required');
  assert.equal(AppDataSource.options.database, process.env.SMW_POS_TEST_DATABASE);
  assert.match(process.env.SMW_POS_TEST_DATABASE, /^smw_(?:sep_23|may_4|[a-z0-9_]*test[a-z0-9_]*)$/);
  const db = new DataSource({ ...AppDataSource.options, logging: false });
  await db.initialize();
  let itemId;
  try {
    const [location] = await db.query("SELECT id FROM location WHERE slug='training-location' AND isDeleted=0");
    assert.ok(location);
    const source = await db.getRepository(Item).findOneByOrFail({ locationId: location.id, isDeleted: false });
    const item = await db.getRepository(Item).save(db.getRepository(Item).create({ itemCategoryId: source.itemCategoryId,
      locationId: location.id, code: 'SMW991-STOCK-TEST', description: 'Isolated invoice stock regression fixture',
      price: 10, royaltyFree: 0, taxStatusId: source.taxStatusId, status: 1, isDeleted: false }));
    itemId = item.id;
    const stock = db.getRepository(ItemLocationStock);
    await stock.save(stock.create({ itemId, locationId: location.id, trackInventory: true, stockQuantity: 1, lowStockQuantity: 1 }));
    const service = new InvoicePosStockService();
    const lines = [0,1].map(() => ({ itemId, isPos: true, code: item.code, inventoryQuantityDeducted: 0 }));
    const results = await Promise.allSettled(lines.map(line => db.transaction(manager => service.changeQuantity(manager, location.id, line, 0, 1))));
    assert.equal(results.filter(r => r.status==='fulfilled').length, 1);
    const failure = results.find(r => r.status==='rejected');
    assert.match(failure.reason.message, /Insufficient stock/);
    assert.equal((await stock.findOneByOrFail({ itemId, locationId: location.id })).stockQuantity, 0);
    assert.equal(await db.getRepository(LowStockAlert).countBy({ itemId }), 1);
    const winner = lines[results.findIndex(r => r.status==='fulfilled')];
    await db.transaction(manager => service.changeQuantity(manager, location.id, winner, 1, 0));
    assert.equal((await stock.findOneByOrFail({ itemId, locationId: location.id })).stockQuantity, 1);
    // Simulate invoice save failing after stock and alert creation.
    await assert.rejects(db.transaction(async manager => {
      await service.changeQuantity(manager, location.id, { ...winner }, 0, 1);
      throw new Error('Simulated invoice persistence failure');
    }), /Simulated invoice/);
    assert.equal((await stock.findOneByOrFail({ itemId, locationId: location.id })).stockQuantity, 1);
    assert.equal(await db.getRepository(LowStockAlert).countBy({ itemId }), 1);
    // A genuine second crossing creates a second alert, not repeated under-threshold alerts.
    await db.transaction(manager => service.changeQuantity(manager, location.id, winner, 0, 1));
    assert.equal(await db.getRepository(LowStockAlert).countBy({ itemId }), 2);
  } finally {
    if (itemId) await db.transaction(async manager => {
      await manager.delete(LowStockAlert, { itemId });
      await manager.delete(ItemLocationStock, { itemId });
      await manager.delete(Item, { id: itemId });
    });
    await db.destroy();
  }
});
