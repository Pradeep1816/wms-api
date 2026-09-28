import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { createConnection, Connection, RowDataPacket } from 'mysql2/promise';
import { QueryRunner } from 'typeorm';
import { AddCategoryAdvertisementSnapshots1791600000000 } from '../../src/migrations/1791600000000-AddCategoryAdvertisementSnapshots';

// Explicit opt-in. All DDL/DML runs against connection-local TEMPORARY tables;
// this never synchronizes, truncates, or changes application tables.
describe.skipIf(process.env.SMW_ADVERTISEMENT_MIGRATION_TEST !== '1')(
  'advertisement migration on MySQL temporary fixtures',
  () => {
    let db: Connection;
    const migration = new AddCategoryAdvertisementSnapshots1791600000000();
    let runner: QueryRunner;

    beforeAll(async () => {
      const env = parse(readFileSync('.env'));
      db = await createConnection({
        host: env.DB_HOST,
        port: Number(env.DB_PORT || 3306),
        user: env.DB_USERNAME,
        password: env.DB_PASSWORD,
        database: env.DB_DATABASE,
      });
      // Create every referenced table before invoking migration SQL, so no query
      // can resolve a name to a persistent application table on this connection.
      const schemas: Record<string, string> = {
        location_debt:
          'id int primary key, locationId int, type int, value decimal(5,2)',
        location: 'id int primary key, isDeleted int',
        item_category: 'id int primary key, isDeleted int',
        location_category_royalty:
          'id int auto_increment primary key, locationId int, itemCategoryId int, royality decimal(5,2), unique(locationId,itemCategoryId)',
        invoice: 'id int primary key, location_id int',
        invoice_line_item:
          'id int primary key, invoice_id int, royaltyFree int, royaltyCategoryId int',
        lesson: 'id int primary key, courseId int',
        course: 'id int primary key, locationId int',
        lesson_payment:
          'id int primary key, lessonId int, date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
        item: 'id int primary key, royaltyFree int',
        pos_transaction: 'id int primary key, locationId int',
        pos_transaction_line_item:
          'id int primary key, posTransactionId int, itemId int, royaltyFreeSnapshot int, royaltyCategoryId int',
        royalty_transaction:
          'id int primary key, locationId int, royaltyFree int, itemCategoryId int, eventType varchar(32), revenueAmount decimal(12,4)',
      };
      for (const [name, columns] of Object.entries(schemas))
        await db.query(`CREATE TEMPORARY TABLE ${name} (${columns})`);
      runner = {
        query: async (sql: string, parameters?: unknown[]) =>
          (await db.query(sql, parameters))[0],
      } as unknown as QueryRunner;
    });

    afterAll(async () => {
      await db?.end();
    });

    it('seeds each location independently, preserves royalties, exempts free items, and supports rollback', async () => {
      await db.query('INSERT INTO location VALUES (1,0),(2,0)');
      await db.query(
        'INSERT INTO location_debt VALUES (1,1,1,6),(2,1,2,2),(3,2,1,7),(4,2,2,5)',
      );
      await db.query('INSERT INTO item_category VALUES (1,0),(4,0),(5,0)');
      await db.query(
        'INSERT INTO location_category_royalty (locationId,itemCategoryId,royality) VALUES (1,5,8)',
      );
      await db.query('INSERT INTO invoice VALUES (1,1)');
      await db.query(
        'INSERT INTO invoice_line_item VALUES (1,1,0,5),(2,1,1,5),(3,1,0,4)',
      );
      await db.query('INSERT INTO course VALUES (1,2)');
      await db.query('INSERT INTO lesson VALUES (1,1)');
      await db.query(
        "INSERT INTO lesson_payment VALUES (1,1,'2020-01-02 12:00:00')",
      );
      await db.query('INSERT INTO item VALUES (1,0)');
      await db.query('INSERT INTO pos_transaction VALUES (1,2)');
      await db.query(
        'INSERT INTO pos_transaction_line_item VALUES (1,1,1,0,5),(2,1,1,1,5)',
      );
      await db.query(
        "INSERT INTO royalty_transaction VALUES (1,1,0,5,'PAYMENT_RECEIVED',100),(2,1,0,5,'REFUND',-25),(3,1,0,5,'ALLOCATION',-10),(4,2,1,5,'PAYMENT_RECEIVED',100)",
      );
      await migration.up(runner);
      const [allocationDates] = await db.query<RowDataPacket[]>(
        "SELECT DATE_FORMAT(date, '%Y-%m-%d %H:%i:%s') AS date FROM lesson_payment",
      );
      expect(allocationDates[0].date).toBe('2020-01-02 12:00:00');
      const [rates] = await db.query<RowDataPacket[]>(
        'SELECT locationId,royality,advertisement FROM location_category_royalty ORDER BY locationId',
      );
      expect(
        rates.map((row) => [
          row.locationId,
          Number(row.royality),
          Number(row.advertisement),
        ]),
      ).toEqual([
        [1, 8, 2],
        [2, 0, 5],
      ]);
      const [lines] = await db.query<RowDataPacket[]>(
        'SELECT advertisementRateApplied FROM invoice_line_item ORDER BY id',
      );
      expect(lines.map((row) => Number(row.advertisementRateApplied))).toEqual([
        2, 0, 0,
      ]);
      const [lessons] = await db.query<RowDataPacket[]>(
        'SELECT advertisementRateApplied FROM lesson_payment',
      );
      expect(Number(lessons[0].advertisementRateApplied)).toBe(5);
      const [pos] = await db.query<RowDataPacket[]>(
        'SELECT advertisementRateApplied FROM pos_transaction_line_item ORDER BY id',
      );
      expect(pos.map((row) => Number(row.advertisementRateApplied))).toEqual([
        5, 0,
      ]);
      const [events] = await db.query<RowDataPacket[]>(
        'SELECT advertisementAmount FROM royalty_transaction ORDER BY id',
      );
      expect(events.map((row) => Number(row.advertisementAmount))).toEqual([
        2, -0.5, 0, 0,
      ]);
      await db.query('UPDATE location_debt SET value=9 WHERE type=2');
      const [baseline] = await db.query<RowDataPacket[]>(
        'SELECT advertisementBaseline FROM location_debt WHERE type=2 ORDER BY locationId',
      );
      expect(baseline.map((row) => Number(row.advertisementBaseline))).toEqual([
        2, 5,
      ]);
      await migration.down(runner);
      const [columns] = await db.query<RowDataPacket[]>(
        'SHOW COLUMNS FROM royalty_transaction',
      );
      expect(columns.some((row) => row.Field === 'advertisementAmount')).toBe(
        false,
      );
    });
  },
);
