import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertLessonDateColumnsToDatetime1780986217001
  implements MigrationInterface
{
  name = 'ConvertLessonDateColumnsToDatetime1780986217001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE lesson
      MODIFY COLUMN \`date\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      MODIFY COLUMN \`originalDate\` DATETIME NULL
    `);
    await queryRunner.query(`
      ALTER TABLE private_lesson
      MODIFY COLUMN \`expiryDate\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    `);
    await queryRunner.query(`
      ALTER TABLE enrolment
      MODIFY COLUMN \`endDateTime\` DATETIME NOT NULL DEFAULT '0000-00-00 00:00:00'
    `);
    await queryRunner.query(`
      ALTER TABLE course
      MODIFY COLUMN \`startDate\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      MODIFY COLUMN \`endDate\` DATETIME NULL
    `);
    await queryRunner.query(`
      ALTER TABLE course_schedule
      MODIFY COLUMN \`startDate\` DATETIME NOT NULL,
      MODIFY COLUMN \`endDate\` DATETIME NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE auto_renewal
      MODIFY COLUMN \`enrolmentEndDateCurrent\` DATETIME NOT NULL DEFAULT '0000-00-00 00:00:00',
      MODIFY COLUMN \`enrolmentEndDateNew\` DATETIME NOT NULL DEFAULT '0000-00-00 00:00:00',
      MODIFY COLUMN \`lastPaymentCycleStartDate\` DATETIME NOT NULL DEFAULT '0000-00-00 00:00:00',
      MODIFY COLUMN \`lastPaymentCycleEndDate\` DATETIME NOT NULL DEFAULT '0000-00-00 00:00:00'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE lesson
      MODIFY COLUMN \`date\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      MODIFY COLUMN \`originalDate\` TIMESTAMP NULL
    `);
    await queryRunner.query(`
      ALTER TABLE private_lesson
      MODIFY COLUMN \`expiryDate\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    `);
    await queryRunner.query(`
      ALTER TABLE enrolment
      MODIFY COLUMN \`endDateTime\` TIMESTAMP NOT NULL DEFAULT '0000-00-00 00:00:00'
    `);
    await queryRunner.query(`
      ALTER TABLE course
      MODIFY COLUMN \`startDate\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      MODIFY COLUMN \`endDate\` TIMESTAMP NULL
    `);
    await queryRunner.query(`
      ALTER TABLE course_schedule
      MODIFY COLUMN \`startDate\` TIMESTAMP NOT NULL,
      MODIFY COLUMN \`endDate\` TIMESTAMP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE auto_renewal
      MODIFY COLUMN \`enrolmentEndDateCurrent\` TIMESTAMP NOT NULL DEFAULT '0000-00-00 00:00:00',
      MODIFY COLUMN \`enrolmentEndDateNew\` TIMESTAMP NOT NULL DEFAULT '0000-00-00 00:00:00',
      MODIFY COLUMN \`lastPaymentCycleStartDate\` TIMESTAMP NOT NULL DEFAULT '0000-00-00 00:00:00',
      MODIFY COLUMN \`lastPaymentCycleEndDate\` TIMESTAMP NOT NULL DEFAULT '0000-00-00 00:00:00'
    `);
  }
}
