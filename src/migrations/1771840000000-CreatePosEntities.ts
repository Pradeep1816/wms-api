import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePosEntities1771840000000 implements MigrationInterface {
    name = 'CreatePosEntities1771840000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`pos_transaction\` (
            \`id\` int NOT NULL AUTO_INCREMENT,
            \`transactionId\` varchar(20) NOT NULL,
            \`locationId\` int NOT NULL,
            \`type\` varchar(1) NOT NULL DEFAULT 'P',
            \`date\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`customerInfo\` varchar(255) NULL,
            \`status\` varchar(20) NOT NULL DEFAULT 'DRAFT',
            \`subtotal\` decimal(10,2) NOT NULL DEFAULT '0.00',
            \`discountAmount\` decimal(10,2) NOT NULL DEFAULT '0.00',
            \`tax\` decimal(10,2) NOT NULL DEFAULT '0.00',
            \`totalAmount\` decimal(10,2) NOT NULL DEFAULT '0.00',
            \`paidAmount\` decimal(10,2) NOT NULL DEFAULT '0.00',
            \`balance\` decimal(10,2) NOT NULL DEFAULT '0.00',
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`UQ_transactionId\` (\`transactionId\`)
        ) ENGINE=InnoDB`);

        await queryRunner.query(`CREATE TABLE \`pos_transaction_line_item\` (
            \`id\` int NOT NULL AUTO_INCREMENT,
            \`posTransactionId\` int NOT NULL,
            \`itemId\` int unsigned NOT NULL,
            \`quantity\` int NOT NULL,
            \`price\` decimal(10,2) NOT NULL,
            \`discount\` decimal(10,2) NOT NULL DEFAULT '0.00',
            \`overridePrice\` decimal(10,2) NULL,
            \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB`);

        await queryRunner.query(`ALTER TABLE \`pos_transaction_line_item\` 
            ADD CONSTRAINT \`FK_pos_transaction_line_item_posTransaction\` 
            FOREIGN KEY (\`posTransactionId\`) 
            REFERENCES \`pos_transaction\`(\`id\`) 
            ON DELETE CASCADE ON UPDATE CASCADE`);

        await queryRunner.query(`ALTER TABLE \`pos_transaction_line_item\` 
            ADD CONSTRAINT \`FK_pos_transaction_line_item_item\` 
            FOREIGN KEY (\`itemId\`) 
            REFERENCES \`item\`(\`id\`) 
            ON DELETE NO ACTION ON UPDATE NO ACTION`);

        await queryRunner.query(`CREATE INDEX \`IDX_pos_transaction_locationId\` ON \`pos_transaction\` (\`locationId\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_pos_transaction_status\` ON \`pos_transaction\` (\`status\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_pos_transaction_createdAt\` ON \`pos_transaction\` (\`createdAt\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_pos_transaction_line_item_posTransactionId\` ON \`pos_transaction_line_item\` (\`posTransactionId\`)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_pos_transaction_line_item_posTransactionId\` ON \`pos_transaction_line_item\``);
        await queryRunner.query(`DROP INDEX \`IDX_pos_transaction_createdAt\` ON \`pos_transaction\``);
        await queryRunner.query(`DROP INDEX \`IDX_pos_transaction_status\` ON \`pos_transaction\``);
        await queryRunner.query(`DROP INDEX \`IDX_pos_transaction_locationId\` ON \`pos_transaction\``);

        await queryRunner.query(`ALTER TABLE \`pos_transaction_line_item\` 
            DROP FOREIGN KEY \`FK_pos_transaction_line_item_item\``);
        
        await queryRunner.query(`ALTER TABLE \`pos_transaction_line_item\` 
            DROP FOREIGN KEY \`FK_pos_transaction_line_item_posTransaction\``);
        
        await queryRunner.query(`DROP TABLE \`pos_transaction_line_item\``);
        
        await queryRunner.query(`DROP TABLE \`pos_transaction\``);
    }
}
