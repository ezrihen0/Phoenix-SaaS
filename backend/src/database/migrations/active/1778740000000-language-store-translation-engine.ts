import { MigrationInterface, QueryRunner } from "typeorm";

export class LanguageStoreTranslationEngine1778740000000 implements MigrationInterface {
  name = "LanguageStoreTranslationEngine1778740000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`customer_output_translation_records\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`created_by_user_id\` varchar(36) NOT NULL,
        \`finalized_by_user_id\` varchar(36) NULL,
        \`surface_key\` varchar(64) NOT NULL,
        \`source_language_code\` varchar(16) NOT NULL,
        \`target_language_code\` varchar(16) NOT NULL,
        \`source_text\` text NOT NULL,
        \`translated_text\` text NOT NULL,
        \`source_character_count\` int NOT NULL DEFAULT 0,
        \`units_consumed\` int NOT NULL DEFAULT 0,
        \`provider_key\` varchar(32) NOT NULL,
        \`provider_model\` varchar(128) NULL,
        \`provider_request_id\` varchar(128) NULL,
        \`status\` varchar(16) NOT NULL,
        \`finalized_at\` datetime(6) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_customer_output_translation_records_org_status\` (\`organization_id\`, \`status\`),
        INDEX \`IDX_customer_output_translation_records_org_created\` (\`organization_id\`, \`created_at\`),
        CONSTRAINT \`FK_customer_output_translation_records_organization\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_customer_output_translation_records_created_by_user\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_customer_output_translation_records_finalized_by_user\` FOREIGN KEY (\`finalized_by_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`translation_usage_ledger\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`translation_record_id\` varchar(36) NOT NULL,
        \`created_by_user_id\` varchar(36) NOT NULL,
        \`usage_kind\` varchar(32) NOT NULL,
        \`source_character_count\` int NOT NULL DEFAULT 0,
        \`units_consumed\` int NOT NULL DEFAULT 0,
        \`billing_period_start\` datetime(6) NULL,
        \`billing_period_end\` datetime(6) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`ux_translation_usage_ledger_record\` (\`translation_record_id\`),
        INDEX \`IDX_translation_usage_ledger_org_created\` (\`organization_id\`, \`created_at\`),
        CONSTRAINT \`FK_translation_usage_ledger_organization\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_translation_usage_ledger_record\` FOREIGN KEY (\`translation_record_id\`) REFERENCES \`customer_output_translation_records\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_translation_usage_ledger_created_by_user\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`translation_usage_ledger\`
      DROP FOREIGN KEY \`FK_translation_usage_ledger_created_by_user\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`translation_usage_ledger\`
      DROP FOREIGN KEY \`FK_translation_usage_ledger_record\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`translation_usage_ledger\`
      DROP FOREIGN KEY \`FK_translation_usage_ledger_organization\`
    `);
    await queryRunner.query(`
      DROP INDEX \`IDX_translation_usage_ledger_org_created\`
      ON \`translation_usage_ledger\`
    `);
    await queryRunner.query(`
      DROP INDEX \`ux_translation_usage_ledger_record\`
      ON \`translation_usage_ledger\`
    `);
    await queryRunner.query(`
      DROP TABLE \`translation_usage_ledger\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`customer_output_translation_records\`
      DROP FOREIGN KEY \`FK_customer_output_translation_records_finalized_by_user\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`customer_output_translation_records\`
      DROP FOREIGN KEY \`FK_customer_output_translation_records_created_by_user\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`customer_output_translation_records\`
      DROP FOREIGN KEY \`FK_customer_output_translation_records_organization\`
    `);
    await queryRunner.query(`
      DROP INDEX \`IDX_customer_output_translation_records_org_created\`
      ON \`customer_output_translation_records\`
    `);
    await queryRunner.query(`
      DROP INDEX \`IDX_customer_output_translation_records_org_status\`
      ON \`customer_output_translation_records\`
    `);
    await queryRunner.query(`
      DROP TABLE \`customer_output_translation_records\`
    `);
  }
}
