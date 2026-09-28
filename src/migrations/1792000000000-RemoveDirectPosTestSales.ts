import { MigrationInterface, QueryRunner } from 'typeorm';
type Row = Record<string, unknown>;

/** SMW-991: all pre-invoice direct POS sales were confirmed test data, including prod/dev. */
export class RemoveDirectPosTestSales1792000000000 implements MigrationInterface {
  name = 'RemoveDirectPosTestSales1792000000000';
  private readonly backupTable = 'migration_direct_pos_test_sales_backup';

  async up(runner: QueryRunner): Promise<void> {
    // MySQL DDL commits implicitly. Explicitly restart the transaction AFTER DDL
    // so the backup, inventory restoration and cleanup are atomic even on retry.
    await runner.query(`CREATE TABLE IF NOT EXISTS ${this.backupTable} (
      entity varchar(64) NOT NULL, rowKey varchar(100) NOT NULL,
      payload json NOT NULL, createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(entity,rowKey)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await runner.query('START TRANSACTION');
    try {
      await runner.query(
        `INSERT IGNORE INTO ${this.backupTable} (entity,rowKey,payload) VALUES ('control','1','{"done":false}')`,
      );
      const [control] = await this.rows(
        runner,
        `SELECT payload FROM ${this.backupTable} WHERE entity='control' AND rowKey='1' FOR UPDATE`,
      );
      const state: unknown =
        typeof control.payload === 'string'
          ? JSON.parse(control.payload)
          : control.payload;
      if ((state as { done?: boolean }).done) {
        await runner.query('COMMIT');
        return;
      }
      const invoiceClause = (await runner.hasColumn(
        'pos_transaction',
        'invoiceId',
      ))
        ? 'AND invoiceId IS NULL'
        : '';
      const sales = await this.rows(
        runner,
        `SELECT * FROM pos_transaction WHERE status IN ('PAID','VOIDED','REFUNDED') ${invoiceClause} ORDER BY id FOR UPDATE`,
      );
      const ids = sales.map((row) => Number(row.id));
      const paymentIds = [
        ...new Set(
          sales
            .flatMap((row) => [row.paymentId, row.refundPaymentId])
            .filter(Boolean)
            .map(Number),
        ),
      ];
      const saleSlots = this.slots(ids),
        paymentSlots = this.slots(paymentIds);
      const lines = ids.length
        ? await this.rows(
            runner,
            `SELECT * FROM pos_transaction_line_item WHERE posTransactionId IN (${saleSlots}) ORDER BY id FOR UPDATE`,
            ids,
          )
        : [];
      const payments = paymentIds.length
        ? await this.rows(
            runner,
            `SELECT * FROM payment WHERE id IN (${paymentSlots}) ORDER BY id FOR UPDATE`,
            paymentIds,
          )
        : [];
      if (payments.some((row) => Number(row.balance) !== 0))
        throw new Error(
          'POS cleanup refused: a test payment has spendable credit.',
        );
      if (paymentIds.length) {
        // Never sever lesson, invoice, recurring or other customer allocations.
        for (const [table, columns] of [
          ['invoice_payment', ['payment_id']],
          ['lesson_payment', ['paymentId']],
          ['credit_usage', ['credit_payment_id', 'debit_payment_id']],
          ['recurring_payment', ['paymentId']],
        ] as const) {
          const links = await this.rows(
            runner,
            `SELECT id FROM ${table} WHERE ${columns.map((column) => `${column} IN (${paymentSlots})`).join(' OR ')} LIMIT 1`,
            columns.flatMap(() => paymentIds),
          );
          if (links.length)
            throw new Error(
              `POS cleanup refused: a test payment is linked to ${table}.`,
            );
        }
        const otherSales = await this.rows(
          runner,
          `SELECT id FROM pos_transaction WHERE id NOT IN (${saleSlots}) AND (paymentId IN (${paymentSlots}) OR refundPaymentId IN (${paymentSlots})) LIMIT 1`,
          [...ids, ...paymentIds, ...paymentIds],
        );
        if (otherSales.length)
          throw new Error(
            'POS cleanup refused: payment shared with another purchase.',
          );
      }
      const royalty = paymentIds.length
        ? await this.rows(
            runner,
            `SELECT * FROM royalty_transaction WHERE paymentId IN (${paymentSlots}) OR originalPaymentId IN (${paymentSlots}) FOR UPDATE`,
            [...paymentIds, ...paymentIds],
          )
        : [];
      if (
        royalty.some(
          (row) => row.paymentId && !paymentIds.includes(Number(row.paymentId)),
        )
      )
        throw new Error(
          'POS cleanup refused: another payment depends on this royalty activity.',
        );
      if (royalty.length) {
        const royaltyIds = royalty.map((row) => Number(row.id));
        const external = await this.rows(
          runner,
          `SELECT id FROM royalty_transaction WHERE relatedRoyaltyTransactionId IN (${this.slots(royaltyIds)}) AND id NOT IN (${this.slots(royaltyIds)}) LIMIT 1`,
          [...royaltyIds, ...royaltyIds],
        );
        if (external.length)
          throw new Error(
            'POS cleanup refused: linked royalty adjustments need review.',
          );
      }
      const receipts = paymentIds.length
        ? await this.rows(
            runner,
            `SELECT * FROM payment_receipt WHERE paymentId IN (${paymentSlots}) FOR UPDATE`,
            paymentIds,
          )
        : [];
      for (const [table, records] of [
        ['pos_transaction', sales],
        ['pos_transaction_line_item', lines],
        ['payment', payments],
        ['royalty_transaction', royalty],
        ['payment_receipt', receipts],
      ] as const) {
        for (const row of records)
          await this.backup(runner, table, String(row.id), row);
      }
      // VOIDED/REFUNDED sales already restored inventory; use only saved deductions.
      const paid = new Map(
        sales
          .filter((row) => row.status === 'PAID')
          .map((row) => [Number(row.id), row]),
      );
      const quantities = new Map<
        string,
        { itemId: number; locationId: number; quantity: number }
      >();
      for (const line of lines) {
        const sale = paid.get(Number(line.posTransactionId));
        const quantity = Number(line.inventoryQuantityDeducted || 0);
        if (!sale || quantity <= 0) continue;
        const key = `${Number(sale.locationId)}:${Number(line.itemId)}`;
        const entry = quantities.get(key) || {
          itemId: Number(line.itemId),
          locationId: Number(sale.locationId),
          quantity: 0,
        };
        entry.quantity += quantity;
        quantities.set(key, entry);
      }
      for (const [key, entry] of [...quantities].sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        const [stock] = await this.rows(
          runner,
          'SELECT * FROM item_location_stock WHERE itemId=? AND locationId=? FOR UPDATE',
          [entry.itemId, entry.locationId],
        );
        if (!stock || stock.stockQuantity == null)
          throw new Error(`POS cleanup refused: missing stock for ${key}.`);
        await this.backup(runner, 'item_location_stock', key, {
          ...stock,
          restoredQuantity: entry.quantity,
        });
        await runner.query(
          'UPDATE item_location_stock SET stockQuantity=stockQuantity+?, updatedAt=CURRENT_TIMESTAMP WHERE itemId=? AND locationId=?',
          [entry.quantity, entry.itemId, entry.locationId],
        );
      }
      if (royalty.length)
        await runner.query(
          `DELETE FROM royalty_transaction WHERE id IN (${this.slots(royalty.map((row) => Number(row.id)))})`,
          royalty.map((row) => Number(row.id)),
        );
      if (paymentIds.length)
        await runner.query(
          `DELETE FROM payment_receipt WHERE paymentId IN (${paymentSlots})`,
          paymentIds,
        );
      if (ids.length) {
        await runner.query(
          `DELETE FROM pos_transaction_line_item WHERE posTransactionId IN (${saleSlots})`,
          ids,
        );
        await runner.query(
          `DELETE FROM pos_transaction WHERE id IN (${saleSlots})`,
          ids,
        );
      }
      if (paymentIds.length)
        await runner.query(
          `DELETE FROM payment WHERE id IN (${paymentSlots})`,
          paymentIds,
        );
      await runner.query(
        `UPDATE ${this.backupTable} SET payload=? WHERE entity='control' AND rowKey='1'`,
        [
          JSON.stringify({
            done: true,
            sales: sales.length,
            payments: payments.length,
            royalty: royalty.length,
            restoredStockRows: quantities.size,
          }),
        ],
      );
      await runner.query('COMMIT');
    } catch (error) {
      await runner.query('ROLLBACK');
      throw error;
    }
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Test POS cleanup cannot be automatically undone after stock changes. Audited originals remain in migration_direct_pos_test_sales_backup for reviewed recovery.',
      ),
    );
  }
  private slots(ids: number[]) {
    return ids.map(() => '?').join(',');
  }
  private async rows(
    runner: QueryRunner,
    sql: string,
    parameters: unknown[] = [],
  ): Promise<Row[]> {
    return (await runner.query(sql, parameters)) as Row[];
  }
  private async backup(
    runner: QueryRunner,
    entity: string,
    key: string,
    row: Row,
  ) {
    await runner.query(
      `INSERT INTO ${this.backupTable} (entity,rowKey,payload) VALUES (?,?,?)`,
      [entity, key, JSON.stringify(row)],
    );
  }
}
