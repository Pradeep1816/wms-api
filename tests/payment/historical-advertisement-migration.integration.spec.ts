import { createConnection, Connection } from 'mysql2/promise';
import { QueryRunner } from 'typeorm';
import { PreserveHistoricalAdvertisementRounding1791900000000 } from '../../src/migrations/1791900000000-PreserveHistoricalAdvertisementRounding';
import { AddCategoryAdvertisementSnapshots1791600000000 } from '../../src/migrations/1791600000000-AddCategoryAdvertisementSnapshots';

// Opt-in: clones real dev/dump definitions into CONNECTION-LOCAL temporary
// tables. No persistent table or migration history is modified. Closing the
// connection removes every fixture, even when an assertion fails.
describe.skipIf(process.env.SMW_ROUNDING_MIGRATION_TEST !== '1')(
  'historical advertisement MySQL migration',
  () => {
    it.each(['smw_may_4', 'smw_sep_24'])(
      'upgrades %s and preserves existing accounting data',
      async (database) => {
        const db: Connection = await createConnection({
          host: process.env.DB_HOST,
          port: Number(process.env.DB_PORT || 3306),
          user: process.env.DB_USERNAME,
          password: process.env.DB_PASSWORD,
          database,
        });
        try {
          const tables = [
            'payment',
            'royalty_transaction',
            'location_debt',
            'location_category_royalty',
            'location',
            'item_category',
            'invoice_line_item',
            'invoice',
            'lesson_payment',
            'lesson',
            'course',
            'pos_transaction_line_item',
            'pos_transaction',
            'item',
          ];
          for (const table of tables) {
            await db.query(
              `CREATE TEMPORARY TABLE rounding_${table} LIKE ${database}.${table}`,
            );
          }
          const names = new RegExp(`\\b(${tables.join('|')})\\b`, 'g');
          const query = async (sql: string, parameters?: any) =>
            (await db.query(sql.replace(names, 'rounding_$1'), parameters))[0];
          const runner = {
            query,
            hasColumn: async (table: string, column: string) =>
              (
                (await query(`SHOW COLUMNS FROM ${table} LIKE ?`, [
                  column,
                ])) as unknown[]
              ).length > 0,
          } as unknown as QueryRunner;

          // Keep the rehearsal repeatable after dev has received this fix.
          if (
            await runner.hasColumn('payment', 'advertisementCalculationVersion')
          ) {
            await query(
              'ALTER TABLE payment DROP COLUMN advertisementCalculationVersion',
            );
          }

          // Read templates with a separate connection, because temporary tables
          // shadow even database-qualified names on their own connection.
          const source = await createConnection({
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT || 3306),
            user: process.env.DB_USERNAME,
            password: process.env.DB_PASSWORD,
            database,
          });
          let payment: any, ledger: any;
          try {
            [[payment]] = await source.query<any[]>(
              'SELECT * FROM payment LIMIT 1',
            );
            [[ledger]] = await source.query<any[]>(
              'SELECT * FROM royalty_transaction LIMIT 1',
            );
          } finally {
            await source.end();
          }
          expect(payment).toBeDefined();
          expect(ledger).toBeDefined();
          delete payment.advertisementCalculationVersion;
          for (const id of [1, 2, 3, 4])
            await query('INSERT INTO payment SET ?', {
              ...payment,
              id,
              date: '2026-09-01 12:00:00',
            });
          // Old recognition plus a new correction must remain historical. A new
          // payment backdated to the same day must remain version 2.
          for (const row of [
            {
              id: 1,
              paymentId: 1,
              schemaVersion: 1,
              eventType: 'PAYMENT_RECEIVED',
            },
            { id: 2, paymentId: 1, schemaVersion: 2, eventType: 'TRANSFER_IN' },
            {
              id: 3,
              paymentId: 2,
              schemaVersion: 2,
              eventType: 'PAYMENT_RECEIVED',
            },
            {
              id: 4,
              paymentId: 4,
              schemaVersion: 1,
              eventType: 'PAYMENT_RECEIVED',
            },
          ])
            await query('INSERT INTO royalty_transaction SET ?', {
              ...ledger,
              ...row,
              idempotencyKey: `rounding-fixture-${row.id}`,
            });
          if (database === 'smw_sep_24')
            await new AddCategoryAdvertisementSnapshots1791600000000().up(
              runner,
            );
          const before = (await query(
            'SELECT * FROM payment ORDER BY id',
          )) as any[];
          const ledgerBefore = await query(
            'SELECT * FROM royalty_transaction ORDER BY id',
          );
          const migration =
            new PreserveHistoricalAdvertisementRounding1791900000000();
          await migration.up(runner);
          const after = (await query(
            'SELECT * FROM payment ORDER BY id',
          )) as any[];
          expect(
            after.map((row) => row.advertisementCalculationVersion),
          ).toEqual([1, 2, 1, 1]);
          expect(
            after.map(({ advertisementCalculationVersion, ...row }) => row),
          ).toEqual(before);
          expect(
            await query('SELECT * FROM royalty_transaction ORDER BY id'),
          ).toEqual(ledgerBefore);
          await query('INSERT INTO payment SET ?', {
            ...payment,
            id: 5,
            date: '2026-08-01 12:00:00',
          });
          expect(
            await query(
              'SELECT advertisementCalculationVersion FROM payment WHERE id=5',
            ),
          ).toEqual([{ advertisementCalculationVersion: 2 }]);
          await migration.up(runner);
          expect(
            (
              (await query(
                'SELECT advertisementCalculationVersion FROM payment ORDER BY id',
              )) as any[]
            ).map((row) => row.advertisementCalculationVersion),
          ).toEqual([1, 2, 1, 1, 2]);
          await migration.down(runner);
          expect(
            await runner.hasColumn(
              'payment',
              'advertisementCalculationVersion',
            ),
          ).toBe(false);
          // Resume after the first DDL committed but before the backfill completed.
          await query(
            'ALTER TABLE payment ADD COLUMN advertisementCalculationVersion tinyint unsigned NULL DEFAULT NULL',
          );
          await migration.up(runner);
          expect(
            (
              (await query(
                'SELECT advertisementCalculationVersion FROM payment WHERE id=2',
              )) as any[]
            )[0].advertisementCalculationVersion,
          ).toBe(2);
        } finally {
          await db.end();
        }
      },
      120000,
    );
  },
);
