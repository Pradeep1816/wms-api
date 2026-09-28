import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTeacherCompensationAdjustment1782350000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE teacher_compensation_adjustment (
        id int unsigned NOT NULL AUTO_INCREMENT,
        locationId int unsigned NOT NULL,
        teacherId int NOT NULL,
        documentType enum('time_voucher', 'invoiced_lessons') NOT NULL,
        startDate date NOT NULL,
        endDate date NOT NULL,
        minimumHours decimal(8,2) NOT NULL,
        hourlyRate decimal(10,2) NULL,
        note varchar(500) NULL,
        createdByUserId int NOT NULL,
        updatedByUserId int NOT NULL,
        isDeleted tinyint(1) NOT NULL DEFAULT 0,
        createdOn timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        updatedOn timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_tca_teacher_lookup (locationId, teacherId, documentType, startDate, endDate, isDeleted),
        KEY idx_tca_created_by (createdByUserId),
        KEY idx_tca_updated_by (updatedByUserId),
        CONSTRAINT fk_tca_location FOREIGN KEY (locationId) REFERENCES location (id),
        CONSTRAINT fk_tca_teacher FOREIGN KEY (teacherId) REFERENCES user (id),
        CONSTRAINT fk_tca_created_by FOREIGN KEY (createdByUserId) REFERENCES user (id),
        CONSTRAINT fk_tca_updated_by FOREIGN KEY (updatedByUserId) REFERENCES user (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE teacher_compensation_adjustment');
  }
}
