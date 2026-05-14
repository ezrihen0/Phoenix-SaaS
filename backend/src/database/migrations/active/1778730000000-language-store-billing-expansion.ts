import { MigrationInterface, QueryRunner } from "typeorm";

export class LanguageStoreBillingExpansion1778730000000 implements MigrationInterface {
  name = "LanguageStoreBillingExpansion1778730000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`billing_account_subscription_items\` (
        \`id\` varchar(36) NOT NULL,
        \`billing_account_id\` varchar(36) NOT NULL,
        \`provider\` varchar(32) NOT NULL,
        \`provider_subscription_id\` varchar(128) NULL,
        \`provider_subscription_item_id\` varchar(128) NOT NULL,
        \`provider_price_id\` varchar(128) NULL,
        \`item_kind\` varchar(64) NOT NULL,
        \`plan_key\` varchar(32) NULL,
        \`allocated_organization_id\` varchar(36) NULL,
        \`quantity\` int NOT NULL DEFAULT 1,
        \`is_active\` tinyint(1) NOT NULL DEFAULT 1,
        \`current_period_start\` datetime(6) NULL,
        \`current_period_end\` datetime(6) NULL,
        \`last_provider_sync_at\` datetime(6) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`ux_billing_account_subscription_items_provider_item\` (\`provider\`, \`provider_subscription_item_id\`),
        INDEX \`IDX_billing_account_subscription_items_account\` (\`billing_account_id\`),
        INDEX \`IDX_billing_account_subscription_items_allocated_org\` (\`allocated_organization_id\`),
        CONSTRAINT \`FK_billing_account_subscription_items_account\` FOREIGN KEY (\`billing_account_id\`) REFERENCES \`billing_accounts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_billing_account_subscription_items_allocated_org\` FOREIGN KEY (\`allocated_organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`organization_language_entitlements\` (
        \`organization_id\` varchar(36) NOT NULL,
        \`billing_account_id\` varchar(36) NOT NULL,
        \`source_plan_key\` varchar(32) NOT NULL,
        \`billing_status\` varchar(32) NOT NULL,
        \`language_store_enabled\` tinyint(1) NOT NULL DEFAULT 0,
        \`included_additional_language_slots\` int NOT NULL DEFAULT 0,
        \`addon_additional_language_slots\` int NOT NULL DEFAULT 0,
        \`total_additional_language_slots\` int NOT NULL DEFAULT 0,
        \`included_translation_units\` int NOT NULL DEFAULT 0,
        \`addon_translation_units\` int NOT NULL DEFAULT 0,
        \`total_translation_units\` int NOT NULL DEFAULT 0,
        \`last_reconciled_at\` datetime(6) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`organization_id\`),
        INDEX \`IDX_organization_language_entitlements_billing_account\` (\`billing_account_id\`),
        CONSTRAINT \`FK_organization_language_entitlements_organization\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_organization_language_entitlements_billing_account\` FOREIGN KEY (\`billing_account_id\`) REFERENCES \`billing_accounts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`organization_language_entitlements\`
      DROP FOREIGN KEY \`FK_organization_language_entitlements_billing_account\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`organization_language_entitlements\`
      DROP FOREIGN KEY \`FK_organization_language_entitlements_organization\`
    `);
    await queryRunner.query(`
      DROP INDEX \`IDX_organization_language_entitlements_billing_account\`
      ON \`organization_language_entitlements\`
    `);
    await queryRunner.query(`
      DROP TABLE \`organization_language_entitlements\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`billing_account_subscription_items\`
      DROP FOREIGN KEY \`FK_billing_account_subscription_items_allocated_org\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`billing_account_subscription_items\`
      DROP FOREIGN KEY \`FK_billing_account_subscription_items_account\`
    `);
    await queryRunner.query(`
      DROP INDEX \`IDX_billing_account_subscription_items_allocated_org\`
      ON \`billing_account_subscription_items\`
    `);
    await queryRunner.query(`
      DROP INDEX \`IDX_billing_account_subscription_items_account\`
      ON \`billing_account_subscription_items\`
    `);
    await queryRunner.query(`
      DROP INDEX \`ux_billing_account_subscription_items_provider_item\`
      ON \`billing_account_subscription_items\`
    `);
    await queryRunner.query(`
      DROP TABLE \`billing_account_subscription_items\`
    `);
  }
}
