import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bug 2 (cross-location privilege clobber) — one-off data repair.
 *
 * The pre-fix `PermissionService.addPermission` used `repository.save()`, which —
 * because `rbac_auth_item_child` has no unique key and the entity PK omits
 * `location_id` — could rewrite/collapse every location's row for a permission
 * onto a single location. The staff "Payment Reports" permission
 * (`staffmember` / `managePaymentsReport`) was collapsed this way: multiple rows
 * all pointing at one location, with the other locations silently dropped.
 *
 * This migration ONLY touches `staffmember / managePaymentsReport`, and ONLY when
 * it is actually clobbered (i.e. duplicate rows exist — more rows than distinct
 * locations). When clobbered, it restores the known-good per-location set that was
 * stable across four consecutive backup snapshots (smw_may_22 → smw_july_9):
 *
 *   Training Location (1), Woodbridge (9), Burlington (15), Richmond Hill (16),
 *   Newmarket (18), North Brampton (20), West Brampton (21).
 *
 * (The historical set also included South Brampton (19), but that location is
 * deleted, so its inert grant is intentionally omitted.)
 *
 * If the permission is already healthy (no duplicate rows), the migration does
 * nothing — so it is safe to run in any environment. The application-layer fix in
 * PermissionService prevents this from recurring.
 */
export class FixManagePaymentsReportClobber1783000000000
  implements MigrationInterface
{
  name = 'FixManagePaymentsReportClobber1783000000000';

  private readonly migrationName = 'FixManagePaymentsReportClobber1783000000000';
  private readonly parent = 'staffmember';
  private readonly child = 'managePaymentsReport';
  private readonly intendedLocations = [1, 9, 15, 16, 18, 20, 21];
  private readonly backupTable =
    'migration_manage_payments_report_clobber_backup';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Only act when the permission is actually clobbered: more rows than distinct
    // locations means at least one location is duplicated (the collapse signature).
    const [counts]: Array<{ total: number; distinctLocs: number }> =
      await queryRunner.query(
        `SELECT COUNT(*) AS total, COUNT(DISTINCT location_id) AS distinctLocs
         FROM rbac_auth_item_child WHERE parent = ? AND child = ?`,
        [this.parent, this.child],
      );

    if (Number(counts.total) <= Number(counts.distinctLocs)) {
      // No duplicate rows — nothing to repair.
      return;
    }

    // Preserve the current (clobbered) rows for reversibility.
    await this.createBackupTable(queryRunner);
    await queryRunner.query(
      `INSERT INTO \`${this.backupTable}\` (migrationName, parent, child, location_id)
       SELECT ?, parent, child, location_id
       FROM rbac_auth_item_child WHERE parent = ? AND child = ?`,
      [this.migrationName, this.parent, this.child],
    );

    // Replace the collapsed rows with the correct per-location set.
    await queryRunner.query(
      `DELETE FROM rbac_auth_item_child WHERE parent = ? AND child = ?`,
      [this.parent, this.child],
    );
    for (const locationId of this.intendedLocations) {
      await queryRunner.query(
        `INSERT INTO rbac_auth_item_child (parent, child, location_id) VALUES (?, ?, ?)`,
        [this.parent, this.child, locationId],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.createBackupTable(queryRunner);

    const backupRows: Array<{ location_id: number | null }> =
      await queryRunner.query(
        `SELECT location_id FROM \`${this.backupTable}\` WHERE migrationName = ?`,
        [this.migrationName],
      );

    // up() made no change (permission was already healthy) → nothing to revert.
    if (backupRows.length === 0) {
      return;
    }

    await queryRunner.query(
      `DELETE FROM rbac_auth_item_child WHERE parent = ? AND child = ?`,
      [this.parent, this.child],
    );
    for (const row of backupRows) {
      await queryRunner.query(
        `INSERT INTO rbac_auth_item_child (parent, child, location_id) VALUES (?, ?, ?)`,
        [this.parent, this.child, row.location_id],
      );
    }

    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }

  private async createBackupTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`id\` int unsigned NOT NULL AUTO_INCREMENT,
        \`migrationName\` varchar(190) NOT NULL,
        \`parent\` varchar(64) NOT NULL,
        \`child\` varchar(64) NOT NULL,
        \`location_id\` int DEFAULT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_mpr_backup_mig\` (\`migrationName\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);
  }
}
