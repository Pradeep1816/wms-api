import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class AddInvoicePosPurchases1791800000000 implements MigrationInterface {
  private readonly columns: [string, TableColumn][] = [
    [
      'invoice_payment',
      new TableColumn({
        name: 'posPurposeSnapshot',
        type: 'json',
        isNullable: true,
      }),
    ],
    [
      'invoice_line_item',
      new TableColumn({ name: 'isPos', type: 'tinyint', default: 0 }),
    ],
    [
      'invoice_line_item',
      new TableColumn({ name: 'posSnapshot', type: 'json', isNullable: true }),
    ],
    [
      'invoice_line_item',
      new TableColumn({
        name: 'inventoryQuantityDeducted',
        type: 'int',
        unsigned: true,
        default: 0,
      }),
    ],
    [
      'invoice_line_item',
      new TableColumn({
        name: 'returnedQuantity',
        type: 'int',
        unsigned: true,
        default: 0,
      }),
    ],
    [
      'invoice_line_item',
      new TableColumn({
        name: 'returnedFromLineItemId',
        type: 'int',
        unsigned: true,
        isNullable: true,
      }),
    ],
    [
      'invoice',
      new TableColumn({
        name: 'walkinBuyerName',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
    ],
    [
      'invoice',
      new TableColumn({
        name: 'posReturnRequestKey',
        type: 'varchar',
        length: '100',
        isNullable: true,
        isUnique: true,
      }),
    ],
    [
      'pos_transaction',
      new TableColumn({
        name: 'invoiceId',
        type: 'int',
        unsigned: true,
        isNullable: true,
      }),
    ],
    [
      'royalty_transaction',
      new TableColumn({ name: 'isPos', type: 'tinyint', default: 0 }),
    ],
  ];

  async up(runner: QueryRunner): Promise<void> {
    // No historical reclassification or inventory deduction during deployment.
    for (const [table, column] of this.columns) {
      if (!(await runner.hasColumn(table, column.name)))
        await runner.addColumn(table, column);
    }
    const table = await runner.getTable('invoice_line_item');
    if (
      !table?.indices.some(
        (index) => index.name === 'IDX_invoice_pos_return_source',
      )
    ) {
      await runner.createIndex(
        'invoice_line_item',
        new TableIndex({
          name: 'IDX_invoice_pos_return_source',
          columnNames: ['returnedFromLineItemId'],
        }),
      );
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    const used: Array<{ id: number }> = (await runner.hasColumn(
      'invoice_line_item',
      'isPos',
    ))
      ? await runner.query(
          'SELECT id FROM invoice_line_item WHERE isPos = 1 LIMIT 1',
        )
      : [];
    if (used.length)
      throw new Error(
        'Cannot remove POS invoice audit fields after purchases have been recorded.',
      );
    const table = await runner.getTable('invoice_line_item');
    if (
      table?.indices.some(
        (index) => index.name === 'IDX_invoice_pos_return_source',
      )
    )
      await runner.dropIndex(
        'invoice_line_item',
        'IDX_invoice_pos_return_source',
      );
    for (const [table, column] of [...this.columns].reverse()) {
      if (await runner.hasColumn(table, column.name))
        await runner.dropColumn(table, column.name);
    }
  }
}
