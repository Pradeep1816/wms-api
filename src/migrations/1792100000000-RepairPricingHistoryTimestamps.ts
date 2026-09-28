import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  COLUMNS,
  hash,
  HistoryTimestampRow,
  inUtc,
  planHistoryTimestampRepair,
} from '../pricing/repairs/pricing-history-timestamp-repair';

const BACKUP = 'smw1653_pricing_history_timestamp_backup';

export class RepairPricingHistoryTimestamps1792100000000 implements MigrationInterface {
  // MySQL DDL commits implicitly. Use a dedicated connection so backup-table DDL
  // cannot commit the normal migration runner's enclosing transaction. The data
  // repair + backup use their own atomic transaction and are safe to rerun if the
  // runner fails before recording this migration in its ledger.
  async up(parent: QueryRunner): Promise<void> {
    const runner = parent.connection.createQueryRunner();
    try {
      await this.repair(runner);
    } finally {
      await runner.release();
    }
  }

  private async repair(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE IF NOT EXISTS ${BACKUP} (
      historyId INT UNSIGNED NOT NULL PRIMARY KEY,
      oldChangedOn DATETIME NOT NULL,
      newChangedOn DATETIME NOT NULL,
      beforeHash CHAR(64) NOT NULL,
      afterHash CHAR(64) NOT NULL
    ) ENGINE=InnoDB`);
    await inUtc(runner, async () => {
      await runner.startTransaction();
      try {
        const rows = (await runner.query(
          `SELECT ${COLUMNS} FROM enrolment_tier_change ORDER BY id FOR UPDATE`,
        )) as HistoryTimestampRow[];
        const plan = planHistoryTimestampRepair(rows);
        const backups = (await runner.query(
          `SELECT historyId FROM ${BACKUP}`,
        )) as { historyId: number }[];
        const backedUp = new Set(
          backups.map((row: { historyId: number }) => row.historyId),
        );
        for (const repair of plan.repairs) {
          if (backedUp.has(repair.id))
            throw new Error(
              `SMW-1653: backed-up row ${repair.id} has drifted; refusing to overwrite its backup`,
            );
          const row = rows.find((r) => r.id === repair.id)!;
          const afterHash = hash({ ...row, changedOn: repair.after });
          await runner.query(`INSERT INTO ${BACKUP} VALUES (?,?,?,?,?)`, [
            repair.id,
            repair.before,
            repair.after,
            repair.fingerprint,
            afterHash,
          ]);
          const result = (await runner.query(
            'UPDATE enrolment_tier_change SET changedOn=? WHERE id=? AND changedOn=?',
            [repair.after, repair.id, repair.before],
          )) as { affectedRows: number };
          if (result.affectedRows !== 1)
            throw new Error(`SMW-1653: row ${repair.id} changed during repair`);
          const [saved] = (await runner.query(
            `SELECT ${COLUMNS} FROM enrolment_tier_change WHERE id=?`,
            [repair.id],
          )) as HistoryTimestampRow[];
          if (hash(saved) !== afterHash)
            throw new Error(
              `SMW-1653: row ${repair.id} failed post-write verification`,
            );
        }
        await runner.commitTransaction();
        console.info(
          `SMW-1653: repaired=${plan.repairs.length}, unchanged=${plan.unchanged}, ambiguous=${plan.ambiguous.length}; ambiguous IDs=${plan.ambiguous.join(',')}`,
        );
      } catch (error) {
        await runner.rollbackTransaction();
        throw error;
      }
    });
  }

  async down(parent: QueryRunner): Promise<void> {
    const runner = parent.connection.createQueryRunner();
    try {
      await this.restore(runner);
    } finally {
      await runner.release();
    }
  }

  private async restore(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasTable(BACKUP))) return;
    await inUtc(runner, async () => {
      await runner.startTransaction();
      try {
        const backups = (await runner.query(
          `SELECT historyId,CAST(oldChangedOn AS CHAR) oldChangedOn,afterHash FROM ${BACKUP} ORDER BY historyId FOR UPDATE`,
        )) as { historyId: number; oldChangedOn: string; afterHash: string }[];
        for (const backup of backups) {
          const [row] = (await runner.query(
            `SELECT ${COLUMNS} FROM enrolment_tier_change WHERE id=? FOR UPDATE`,
            [backup.historyId],
          )) as HistoryTimestampRow[];
          if (!row || hash(row) !== backup.afterHash)
            throw new Error(
              `SMW-1653: row ${backup.historyId} changed after repair; rollback refused`,
            );
          await runner.query(
            'UPDATE enrolment_tier_change SET changedOn=? WHERE id=?',
            [backup.oldChangedOn, backup.historyId],
          );
        }
        await runner.query(`DELETE FROM ${BACKUP}`);
        await runner.commitTransaction();
      } catch (error) {
        await runner.rollbackTransaction();
        throw error;
      }
    });
  }
}
