import { MigrationInterface, QueryRunner } from "typeorm";

export class SharedBillingAccounts1778700000000 implements MigrationInterface {
  name = "SharedBillingAccounts1778700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`billing_accounts\` (
        \`id\` varchar(36) NOT NULL,
        \`owner_user_id\` varchar(36) NULL,
        \`anchor_organization_id\` varchar(36) NULL,
        \`plan_key\` varchar(32) NOT NULL DEFAULT 'starter',
        \`billing_status\` varchar(32) NOT NULL DEFAULT 'trialing',
        \`organization_limit\` int NULL,
        \`clover_customer_id\` varchar(64) NULL,
        \`clover_plan_id\` varchar(64) NULL,
        \`clover_subscription_id\` varchar(64) NULL,
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
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_billing_accounts_anchor_org\` (\`anchor_organization_id\`),
        CONSTRAINT \`FK_billing_accounts_owner_user\` FOREIGN KEY (\`owner_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT \`FK_billing_accounts_anchor_org\` FOREIGN KEY (\`anchor_organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      ALTER TABLE \`organization_billing\`
      ADD COLUMN \`billing_account_id\` varchar(36) NULL AFTER \`organization_id\`
    `);

    await queryRunner.query(`
      INSERT INTO \`billing_accounts\` (
        \`id\`,
        \`owner_user_id\`,
        \`anchor_organization_id\`,
        \`plan_key\`,
        \`billing_status\`,
        \`organization_limit\`,
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
        UUID(),
        NULL,
        ob.\`organization_id\`,
        ob.\`plan_key\`,
        ob.\`billing_status\`,
        CASE
          WHEN ob.\`plan_key\` = 'starter' THEN 1
          WHEN ob.\`plan_key\` = 'pro' THEN 3
          ELSE NULL
        END,
        ob.\`clover_customer_id\`,
        ob.\`clover_plan_id\`,
        ob.\`clover_subscription_id\`,
        ob.\`trial_starts_at\`,
        ob.\`trial_ends_at\`,
        ob.\`current_period_start\`,
        ob.\`current_period_end\`,
        ob.\`cancel_at_period_end\`,
        ob.\`canceled_at\`,
        ob.\`deactivated_at\`,
        ob.\`last_clover_sync_at\`,
        ob.\`last_webhook_at\`,
        ob.\`attention_reason\`,
        ob.\`created_at\`,
        ob.\`updated_at\`
      FROM \`organization_billing\` ob
    `);

    await queryRunner.query(`
      UPDATE \`organization_billing\` ob
      INNER JOIN \`billing_accounts\` ba
        ON ba.\`anchor_organization_id\` = ob.\`organization_id\`
      SET ob.\`billing_account_id\` = ba.\`id\`
      WHERE ob.\`billing_account_id\` IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`organization_billing\`
      MODIFY COLUMN \`billing_account_id\` varchar(36) NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX \`IDX_organization_billing_account\`
      ON \`organization_billing\` (\`billing_account_id\`)
    `);

    await queryRunner.query(`
      ALTER TABLE \`organization_billing\`
      ADD CONSTRAINT \`FK_organization_billing_billing_account\`
      FOREIGN KEY (\`billing_account_id\`) REFERENCES \`billing_accounts\`(\`id\`)
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`organization_billing\`
      DROP FOREIGN KEY \`FK_organization_billing_billing_account\`
    `);
    await queryRunner.query(`
      DROP INDEX \`IDX_organization_billing_account\`
      ON \`organization_billing\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`organization_billing\`
      DROP COLUMN \`billing_account_id\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`billing_accounts\`
      DROP FOREIGN KEY \`FK_billing_accounts_owner_user\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`billing_accounts\`
      DROP FOREIGN KEY \`FK_billing_accounts_anchor_org\`
    `);
    await queryRunner.query(`DROP TABLE \`billing_accounts\``);
  }
}
