import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('deployment migration discovery', () => {
  it('loads the configured migration glob through ts-node without helper functions', () => {
    // Match the deployment loader, but build metadata without connecting to a DB
    // or executing migrations. Explicit migration-class lists miss this failure.
    const result = spawnSync(process.execPath, [
      '-r', 'ts-node/register', '-r', 'tsconfig-paths/register', '-e',
      `
      const { AppDataSource } = require('./src/config/data-source');
      const { MigrationExecutor } = require('typeorm');
      (async () => {
        await AppDataSource.buildMetadatas();
        const migrations = new MigrationExecutor(AppDataSource).getMigrations();
        const matches = migrations.filter(m => m.name === 'BackfillFutureLessonNotificationStatuses1788800000000');
        if (matches.length !== 1) throw new Error('Expected exactly one future notification migration');
        if (migrations.filter(m => m.name === 'RepairOptedInFutureLessonNotifications1789128000000').length !== 1) throw new Error('Expected opt-in repair migration');
        if (migrations.filter(m => m.name === 'RepairPricingHistoryTimestamps1792100000000').length !== 1) throw new Error('Expected exactly one pricing-history timestamp repair migration');
        console.log('Migration discovery validated');
      })().catch(error => { console.error(error.message); process.exitCode = 1; });
      `,
    ], { cwd: resolve(__dirname, '../..'), encoding: 'utf8', timeout: 120_000 });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Migration discovery validated');
  }, 130_000);
});
