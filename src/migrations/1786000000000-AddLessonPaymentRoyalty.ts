import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLessonPaymentRoyalty1786000000000 implements MigrationInterface {
  name = 'AddLessonPaymentRoyalty1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE lesson_payment
      ADD COLUMN royaltyCategoryId int unsigned NULL AFTER amount,
      ADD COLUMN royaltyRateApplied decimal(5,2) NULL AFTER royaltyCategoryId
    `);

    await queryRunner.query(`
      UPDATE lesson_payment lessonPayment
      LEFT JOIN lesson ON lesson.id = lessonPayment.lessonId
      LEFT JOIN course ON course.id = lesson.courseId
      LEFT JOIN location_debt lessonRoyalty
        ON lessonRoyalty.locationId = course.locationId AND lessonRoyalty.type = 1
      SET
        lessonPayment.royaltyCategoryId = 1,
        lessonPayment.royaltyRateApplied = COALESCE(lessonRoyalty.value, 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE lesson_payment
      DROP COLUMN royaltyRateApplied,
      DROP COLUMN royaltyCategoryId
    `);
  }
}
