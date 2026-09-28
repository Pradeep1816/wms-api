import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTeacherConfidentialNote1779609600003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE teacher_confidential_note (
        id int unsigned NOT NULL AUTO_INCREMENT,
        locationId int unsigned NOT NULL,
        teacherId int NOT NULL,
        content longtext NOT NULL,
        createdByUserId int NOT NULL,
        isDeleted tinyint(1) NOT NULL DEFAULT 0,
        createdOn timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        updatedOn timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_tcn_teacher_lookup (locationId, teacherId, isDeleted),
        KEY idx_tcn_created_by (createdByUserId),
        CONSTRAINT fk_tcn_location FOREIGN KEY (locationId) REFERENCES location (id),
        CONSTRAINT fk_tcn_teacher FOREIGN KEY (teacherId) REFERENCES user (id),
        CONSTRAINT fk_tcn_created_by FOREIGN KEY (createdByUserId) REFERENCES user (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE teacher_confidential_note');
  }
}
