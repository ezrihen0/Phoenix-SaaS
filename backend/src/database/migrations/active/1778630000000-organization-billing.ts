import { MigrationInterface, QueryRunner } from "typeorm";

export class OrganizationBilling1778630000000 implements MigrationInterface {
  name = "OrganizationBilling1778630000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`organization_billing\` (
        \`organization_id\` varchar(36) NOT NULL,
        \`clover_customer_id\` varchar(64) NULL,
        \`clover_plan_id\` varchar(64) NULL,
        \`clover_subscription_id\` varchar(64) NULL,
        \`plan_key\` varchar(32) NOT NULL DEFAULT 'business',
        \`billing_status\` varchar(32) NOT NULL DEFAULT 'active',
        \`trial_starts_at\` datetime(6) NULL,
        \`trial_ends_at\` datetime(6) NULL,
        \`current_period_start\` datetime(6) NULL,
        \`current_period_end\` datetime(6) NULL,
        \`cancel_at_period_end\` tinyint(1) NOT NULL DEFAULT 0,
        \`canceled_at\` datetime(6) NULL,
        \`deactivated_at\` datetime(6) NULL,
        \`last_clover_sync_at\` datetime(6) NULL,
        \`last_webhook_at\` datetime(6) NULL,
        \`attention_reason\` varchar(512) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`organization_id\`),
        CONSTRAINT \`FK_organization_billing_org\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      INSERT INTO \`organization_billing\` (
        \`organization_id\`,
        \`plan_key\`,
        \`billing_status\`,
        \`clover_customer_id\`,
        \`clover_plan_id\`,
        \`clover_subscription_id\`,
        \`trial_starts_at\`,
        \`trial_ends_at\`,
        \`current_period_start\`,
        \`current_period_end\`,
        \`cancel_at_period_end\`,
        \`canceled_at\`,
        \`deactivated_at\`,
        \`last_clover_sync_at\`,
        \`last_webhook_at\`,
        \`attention_reason\`,
        \`created_at\`,
        \`updated_at\`
      )
      SELECT
        o.\`id\`,
        'business',
        'active',
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        0,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        CURRENT_TIMESTAMP(6),
        CURRENT_TIMESTAMP(6)
      FROM \`organizations\` o
      WHERE NOT EXISTS (
        SELECT 1 FROM \`organization_billing\` b WHERE b.\`organization_id\` = o.\`id\`
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`organization_billing\``);
  }
}
