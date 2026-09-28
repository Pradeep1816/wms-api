import { randomBytes } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

interface WalkinMappingRow {
  customerId: number;
}

export class RepairTrainingWalkinPosCustomer1791500000000 implements MigrationInterface {
  name = 'RepairTrainingWalkinPosCustomer1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Resolve by slug because location IDs may differ between environments.
    const locations = (await queryRunner.query(
      'SELECT id FROM location WHERE slug = ? AND isDeleted = 0',
      ['training-location'],
    )) as Array<{ id: number }>;
    if (locations.length !== 1) {
      throw new Error('Expected one active Training Location');
    }
    const locationId = locations[0].id;
    const mappings = (await queryRunner.query(
      'SELECT customerId FROM location_walkin_customer WHERE locationId = ?',
      [locationId],
    )) as WalkinMappingRow[];
    if (mappings.length !== 1 || !mappings[0].customerId) {
      throw new Error(
        'Expected one Training Location walk-in customer mapping',
      );
    }

    const customerId = mappings[0].customerId;
    const validCustomers = (await queryRunner.query(
      `SELECT u.id
         FROM user u
         WHERE u.id = ?
           AND u.isDeleted = 0
           AND EXISTS (
             SELECT 1 FROM user_location ul
             WHERE ul.user_id = u.id AND ul.location_id = ?
           )
           AND EXISTS (
             SELECT 1 FROM rbac_auth_assignment role
             WHERE role.user_id = CAST(u.id AS CHAR)
               AND role.item_name = 'customer'
           )
         LIMIT 1`,
      [customerId, locationId],
    )) as Array<{ id: number }>;
    if (validCustomers.length > 0) {
      // Inactive mapped customers are intentionally valid for walk-in POS.
      return;
    }

    const existingUsers = (await queryRunner.query(
      'SELECT id FROM user WHERE id = ?',
      [customerId],
    )) as Array<{ id: number }>;
    if (existingUsers.length > 0) {
      throw new Error(
        'Training walk-in customer exists but has invalid location, role, or deletion status',
      );
    }

    // The legacy mapping table is MyISAM in existing databases. Restore its
    // missing customer ID in transactional InnoDB tables instead of changing
    // the mapping to a new ID that could survive a failed migration.
    const now = Math.floor(Date.now() / 1000);
    await queryRunner.query(
      `INSERT INTO user (
         id, username, auth_key, access_token, password_hash, pin_hash,
         oauth_client, oauth_client_user_id, status, canLogin, canMerge,
         isDeleted, created_at, updated_at, logged_at, login_token
       ) VALUES (?, NULL, ?, ?, NULL, NULL, NULL, NULL, 1, 1, 0, 0, ?, ?, NULL, '')`,
      [
        customerId,
        randomBytes(16).toString('hex'),
        randomBytes(20).toString('hex'),
        now,
        now,
      ],
    );

    await queryRunner.query(
      'INSERT INTO user_profile (user_id, firstname, lastname) VALUES (?, ?, ?)',
      [customerId, 'Walkin', 'Customer'],
    );
    await queryRunner.query(
      `INSERT INTO rbac_auth_assignment (item_name, user_id, created_at)
       VALUES ('customer', ?, ?)`,
      [String(customerId), now],
    );
    await queryRunner.query(
      'INSERT INTO user_location (user_id, location_id) VALUES (?, ?)',
      [customerId, locationId],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // A completed POS payment may refer to this customer. Removing it on
    // rollback would corrupt historical sale attribution.
    void queryRunner;
    return Promise.resolve();
  }
}
