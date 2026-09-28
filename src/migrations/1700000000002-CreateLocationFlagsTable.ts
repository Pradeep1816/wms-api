import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateLocationFlagsTable1700000000002 implements MigrationInterface {
  name = 'CreateLocationFlagsTable1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'location_flags',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'location_slug',
            type: 'varchar',
            length: '30',
            isNullable: false,
          },
          {
            name: 'dashboard',
            type: 'varchar',
            length: '20',
            default: "'legacy'",
            isNullable: false,
          },
          {
            name: 'schedule',
            type: 'varchar',
            length: '20',
            default: "'legacy'",
            isNullable: false,
          },
          {
            name: 'enrolments',
            type: 'varchar',
            length: '20',
            default: "'legacy'",
            isNullable: false,
          },
          {
            name: 'students',
            type: 'varchar',
            length: '20',
            default: "'legacy'",
            isNullable: false,
          },
          {
            name: 'customers',
            type: 'varchar',
            length: '20',
            default: "'legacy'",
            isNullable: false,
          },
          {
            name: 'teachers',
            type: 'varchar',
            length: '20',
            default: "'legacy'",
            isNullable: false,
          },
          {
            name: 'privateLessons',
            type: 'varchar',
            length: '20',
            default: "'legacy'",
            isNullable: false,
          },
          {
            name: 'groupCourses',
            type: 'varchar',
            length: '20',
            default: "'legacy'",
            isNullable: false,
          },
          {
            name: 'unscheduledLessons',
            type: 'varchar',
            length: '20',
            default: "'legacy'",
            isNullable: false,
          },
          {
            name: 'recurringPayments',
            type: 'varchar',
            length: '20',
            default: "'legacy'",
            isNullable: false,
          },
          {
            name: 'paymentPreferences',
            type: 'varchar',
            length: '20',
            default: "'legacy'",
            isNullable: false,
          },
          {
            name: 'invoices',
            type: 'varchar',
            length: '20',
            default: "'legacy'",
            isNullable: false,
          },
          {
            name: 'payments',
            type: 'varchar',
            length: '20',
            default: "'legacy'",
            isNullable: false,
          },
          {
            name: 'reports',
            type: 'varchar',
            length: '20',
            default: "'legacy'",
            isNullable: false,
          },
          {
            name: 'releaseNotes',
            type: 'varchar',
            length: '20',
            default: "'legacy'",
            isNullable: false,
          },
          {
            name: 'items',
            type: 'varchar',
            length: '20',
            default: "'legacy'",
            isNullable: false,
          },
          {
            name: 'admin',
            type: 'varchar',
            length: '20',
            default: "'legacy'",
            isNullable: false,
          },
          {
            name: 'setup',
            type: 'varchar',
            length: '20',
            default: "'legacy'",
            isNullable: false,
          },
          {
            name: 'timeline',
            type: 'varchar',
            length: '20',
            default: "'legacy'",
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
        indices: [
          {
            name: 'IDX_location_flags_location_slug',
            columnNames: ['location_slug'],
            isUnique: true,
          },
        ],
      }),
      true, // ifNotExists
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('location_flags');
  }
}
