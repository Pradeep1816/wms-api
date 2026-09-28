import { describe, expect, it, vi } from 'vitest';
import { QueryRunner } from 'typeorm';
import { RemoveDirectPosTestSales1792000000000 } from '../../src/migrations/1792000000000-RemoveDirectPosTestSales';

function fixture(options: { done?: boolean; linked?: string; balance?: number; missingStock?: boolean; deleteFailure?: boolean } = {}) {
  const backups: Array<{ entity: string; row: Record<string, unknown> }> = [];
  const sales = [{ id: 1, status: 'PAID', locationId: 1, paymentId: 10 }, { id: 2, status: 'REFUNDED', locationId: 1, paymentId: 11, refundPaymentId: 12 }, { id: 3, status: 'VOIDED', locationId: 1, paymentId: 13 }];
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes('SELECT payload')) return [{ payload: { done: options.done || false } }];
    if (sql.startsWith('SELECT * FROM pos_transaction WHERE')) return sales;
    if (sql.startsWith('SELECT * FROM pos_transaction_line_item')) return sales.map(s => ({ id:s.id, posTransactionId:s.id, itemId:5, quantity:99, inventoryQuantityDeducted:2 }));
    if (sql.startsWith('SELECT * FROM payment WHERE')) return [10,11,12,13].map(id => ({id, balance:options.balance || 0}));
    if (sql.startsWith('SELECT id FROM') && options.linked && sql.includes(`FROM ${options.linked} `)) return [{ id:7 }];
    if (sql.startsWith('SELECT * FROM item_location_stock')) return options.missingStock ? [] : [{itemId:5,locationId:1,stockQuantity:8,trackInventory:false}];
    if (sql.startsWith('INSERT INTO migration_direct_pos_test_sales_backup')) backups.push({entity: String(values[0]), row: JSON.parse(String(values[2]))});
    if (options.deleteFailure && sql.startsWith('DELETE FROM payment WHERE')) throw new Error('simulated delete failure');
    return [];
  });
  return { runner: { query, hasColumn:vi.fn(async()=>true) } as unknown as QueryRunner, query, backups };
}

describe('authorized direct POS test cleanup',()=>{
  it('restores only recorded paid-sale stock, keeps invoice purchases and backs up payments',async()=>{
    const f=fixture();await new RemoveDirectPosTestSales1792000000000().up(f.runner);
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('AND invoiceId IS NULL'), []);
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('SET stockQuantity=stockQuantity+?'),[2,5,1]);
    expect(f.backups.filter(b=>b.entity==='payment')).toHaveLength(4);
    expect(f.backups.find(b=>b.entity==='item_location_stock')?.row.stockQuantity).toBe(8);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });
  it('a completed retry never deletes or restores twice',async()=>{
    const f=fixture({done:true});await new RemoveDirectPosTestSales1792000000000().up(f.runner);
    expect(f.query.mock.calls.some(([sql])=>sql.startsWith('DELETE')||sql.includes('SET stockQuantity'))).toBe(false);
  });
  it.each(['invoice_payment','lesson_payment','credit_usage','recurring_payment'])('refuses a payment linked to %s',async linked=>{
    const f=fixture({linked});await expect(new RemoveDirectPosTestSales1792000000000().up(f.runner)).rejects.toThrow('linked to');
    expect(f.query.mock.calls.some(([sql])=>sql.startsWith('DELETE'))).toBe(false);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });
  it.each([{balance:1},{missingStock:true}])('refuses unaccounted credit or missing inventory %j',async options=>{
    const f=fixture(options);await expect(new RemoveDirectPosTestSales1792000000000().up(f.runner)).rejects.toThrow('cleanup refused');
    expect(f.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });
  it('rolls back inventory, backups and deletions together after a write failure',async()=>{
    const f=fixture({deleteFailure:true});await expect(new RemoveDirectPosTestSales1792000000000().up(f.runner)).rejects.toThrow('simulated');
    expect(f.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(f.query.mock.calls.some(([sql])=>sql==='COMMIT')).toBe(false);
  });
});
