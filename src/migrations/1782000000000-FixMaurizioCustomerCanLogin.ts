import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixMaurizioCustomerCanLogin1782000000000 implements MigrationInterface {
  private readonly email = 'maurizio@arcadiamusicacademy.com';
  private readonly customerUserId = 3398;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE \`user\` u
      INNER JOIN \`user_contact\` c ON c.\`userId\` = u.\`id\`
      INNER JOIN \`user_email\` e ON e.\`userContactId\` = c.\`id\`
      INNER JOIN \`rbac_auth_assignment\` a ON a.\`user_id\` = CAST(u.\`id\` AS CHAR)
      SET u.\`canLogin\` = 1
      WHERE u.\`id\` = ?
        AND LOWER(e.\`email\`) = ?
        AND a.\`item_name\` = 'customer'
        AND c.\`isPrimary\` = 1
        AND c.\`isDeleted\` = 0
        AND e.\`isDeleted\` = 0
        AND u.\`isDeleted\` = 0
        AND u.\`canLogin\` = 0
      `,
      [this.customerUserId, this.email],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE \`user\` u
      INNER JOIN \`user_contact\` c ON c.\`userId\` = u.\`id\`
      INNER JOIN \`user_email\` e ON e.\`userContactId\` = c.\`id\`
      INNER JOIN \`rbac_auth_assignment\` a ON a.\`user_id\` = CAST(u.\`id\` AS CHAR)
      SET u.\`canLogin\` = 0
      WHERE u.\`id\` = ?
        AND LOWER(e.\`email\`) = ?
        AND a.\`item_name\` = 'customer'
        AND c.\`isPrimary\` = 1
        AND c.\`isDeleted\` = 0
        AND e.\`isDeleted\` = 0
        AND u.\`isDeleted\` = 0
        AND u.\`canLogin\` = 1
      `,
      [this.customerUserId, this.email],
    );
  }
}
