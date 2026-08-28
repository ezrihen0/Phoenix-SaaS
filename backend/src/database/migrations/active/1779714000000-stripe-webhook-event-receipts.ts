import { MigrationInterface, QueryRunner } from "typeorm";

export class StripeWebhookEventReceipts1779714000000 implements MigrationInterface {
  name = "StripeWebhookEventReceipts1779714000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`stripe_webhook_event_receipts\` (
        \`id\` varchar(36) NOT NULL,
        \`stripe_event_id\` varchar(255) NOT NULL,
        \`event_type\` varchar(128) NOT NULL,
        \`stripe_event_created\` bigint NOT NULL,
        \`billing_account_id\` varchar(36) NULL,
        \`provider_customer_id\` varchar(128) NULL,
        \`provider_subscription_id\` varchar(128) NULL,
        \`processing_status\` enum ('processing', 'processed', 'ignored', 'failed') NOT NULL,
        \`error_summary\` varchar(512) NULL,
        \`processed_at\` datetime(6) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`ux_stripe_webhook_event_id\` (\`stripe_event_id\`),
        INDEX \`ix_stripe_webhook_subscription_created\` (\`provider_subscription_id\`, \`stripe_event_created\`),
        INDEX \`ix_stripe_webhook_billing_account\` (\`billing_account_id\`, \`stripe_event_created\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS `stripe_webhook_event_receipts`");
  }
}
