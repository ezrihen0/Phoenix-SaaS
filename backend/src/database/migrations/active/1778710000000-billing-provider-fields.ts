import { MigrationInterface, QueryRunner } from "typeorm";

export class BillingProviderFields1778710000000 implements MigrationInterface {
  name = "BillingProviderFields1778710000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`billing_accounts\`
      ADD COLUMN \`billing_provider\` varchar(32) NULL AFTER \`organization_limit\`,
      ADD COLUMN \`provider_customer_id\` varchar(128) NULL AFTER \`billing_provider\`,
      ADD COLUMN \`provider_subscription_id\` varchar(128) NULL AFTER \`provider_customer_id\`,
      ADD COLUMN \`provider_price_id\` varchar(128) NULL AFTER \`provider_subscription_id\`,
      ADD COLUMN \`last_provider_sync_at\` datetime(6) NULL AFTER \`last_clover_sync_at\`
    `);

    await queryRunner.query(`
      UPDATE \`billing_accounts\`
      SET \`billing_provider\` = 'clover',
          \`provider_customer_id\` = \`clover_customer_id\`,
          \`provider_subscription_id\` = \`clover_subscription_id\`,
          \`provider_price_id\` = \`clover_plan_id\`,
          \`last_provider_sync_at\` = \`last_clover_sync_at\`
      WHERE \`clover_customer_id\` IS NOT NULL
         OR \`clover_subscription_id\` IS NOT NULL
         OR \`clover_plan_id\` IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`billing_accounts\`
      DROP COLUMN \`last_provider_sync_at\`,
      DROP COLUMN \`provider_price_id\`,
      DROP COLUMN \`provider_subscription_id\`,
      DROP COLUMN \`provider_customer_id\`,
      DROP COLUMN \`billing_provider\`
    `);
  }
}
