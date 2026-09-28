import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSubMenuLocationFlags1759740106191 implements MigrationInterface {
    name = 'AddSubMenuLocationFlags1759740106191'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Reports
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`accountReceivable\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`financialSummary\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`birthdays\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`paymentsReport\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`royalty\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`taxCollected\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`royaltyFree\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`reportItems\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`itemsByCategory\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`discount\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`salesAndPayment\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`allLocations\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`rentals\` varchar(20) NOT NULL DEFAULT 'legacy'`);

        // Admin
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`administrators\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`programs\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`cities\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`provinces\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`countries\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`taxes\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`colorCode\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`itemCategory\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`reminderNotes\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`blogs\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`locations\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`holidays\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`emailTemplate\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`testEmail\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`termsOfService\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`referralSources\` varchar(20) NOT NULL DEFAULT 'legacy'`);

        // Setup
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`privileges\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`staffMembers\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`owners\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`classrooms\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`import\` varchar(20) NOT NULL DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE \`location_flags\` ADD \`locationSettings\` varchar(20) NOT NULL DEFAULT 'legacy'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Reports
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`accountReceivable\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`financialSummary\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`birthdays\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`paymentsReport\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`royalty\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`taxCollected\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`royaltyFree\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`reportItems\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`itemsByCategory\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`discount\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`salesAndPayment\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`allLocations\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`rentals\``);

        // Admin
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`administrators\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`programs\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`cities\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`provinces\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`countries\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`taxes\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`colorCode\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`itemCategory\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`reminderNotes\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`blogs\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`locations\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`holidays\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`emailTemplate\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`testEmail\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`termsOfService\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`referralSources\``);

        // Setup
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`privileges\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`staffMembers\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`owners\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`classrooms\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`import\``);
        await queryRunner.query(`ALTER TABLE \`location_flags\` DROP COLUMN \`locationSettings\``);
    }

}
