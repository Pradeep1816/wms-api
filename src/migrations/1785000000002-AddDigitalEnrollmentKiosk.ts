import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDigitalEnrollmentKiosk1785000000002
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_invitation
        ADD isKiosk tinyint(1) NOT NULL DEFAULT 0,
        ADD kioskToken varchar(128) NULL,
        ADD pinHash char(64) NULL,
        ADD KEY IDX_digital_enrollment_invitation_is_kiosk (locationId, isKiosk)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_invitation
        DROP KEY IDX_digital_enrollment_invitation_is_kiosk,
        DROP COLUMN pinHash,
        DROP COLUMN kioskToken,
        DROP COLUMN isKiosk
    `);
  }
}
