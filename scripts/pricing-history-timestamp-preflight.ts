import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { inspectHistoryTimestampRepair } from '../src/pricing/repairs/pricing-history-timestamp-repair';

/** Read-only. Uses the target environment's normal DB_* settings. */
async function main() {
  const db = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    timezone: 'Z',
    synchronize: false,
  });
  await db.initialize();
  const runner = db.createQueryRunner();
  try {
    const result = await inspectHistoryTimestampRepair(runner);
    console.log(
      JSON.stringify({ database: process.env.DB_DATABASE, ...result }, null, 2),
    );
  } finally {
    await runner.release();
    await db.destroy();
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Preflight failed');
  process.exitCode = 1;
});
