import { MigrationInterface, QueryRunner } from "typeorm";

export class MarketingPhase6AutomationRules1778800000000 implements MigrationInterface {
  name = "MarketingPhase6AutomationRules1778800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`marketing_automation_rules\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`description\` text NULL,
        \`enabled\` tinyint NOT NULL DEFAULT 1,
        \`trigger_opportunity_types_json\` text NOT NULL,
        \`action_type\` varchar(32) NOT NULL,
        \`action_config_json\` text NOT NULL,
        \`cooldown_seconds\` int NOT NULL DEFAULT '0',
        \`created_by_user_id\` varchar(36) NULL,
        \`updated_by_user_id\` varchar(36) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_marketing_automation_rules_org_enabled\` (\`organization_id\`, \`enabled\`),
        INDEX \`IDX_marketing_automation_rules_org_updated\` (\`organization_id\`, \`updated_at\`),
        CONSTRAINT \`FK_marketing_automation_rules_organization\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_marketing_automation_rules_created_by\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT \`FK_marketing_automation_rules_updated_by\` FOREIGN KEY (\`updated_by_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`marketing_automation_runs\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`rule_id\` varchar(36) NOT NULL,
        \`idempotency_key\` varchar(191) NOT NULL,
        \`marketing_opportunity_id\` varchar(36) NULL,
        \`marketing_content_draft_id\` varchar(36) NULL,
        \`outcome\` varchar(32) NOT NULL,
        \`skip_reason\` varchar(128) NULL,
        \`error_detail\` text NULL,
        \`trigger_snapshot_json\` text NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`ux_marketing_automation_runs_org_idempotency\` (\`organization_id\`, \`idempotency_key\`),
        INDEX \`IDX_marketing_automation_runs_org_rule_created\` (\`organization_id\`, \`rule_id\`, \`created_at\`),
        INDEX \`IDX_marketing_automation_runs_org_created\` (\`organization_id\`, \`created_at\`),
        CONSTRAINT \`FK_marketing_automation_runs_organization\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_marketing_automation_runs_rule\` FOREIGN KEY (\`rule_id\`) REFERENCES \`marketing_automation_rules\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_marketing_automation_runs_opportunity\` FOREIGN KEY (\`marketing_opportunity_id\`) REFERENCES \`marketing_opportunities\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT \`FK_marketing_automation_runs_draft\` FOREIGN KEY (\`marketing_content_draft_id\`) REFERENCES \`marketing_content_drafts\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`marketing_automation_runs\` DROP FOREIGN KEY \`FK_marketing_automation_runs_draft\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`marketing_automation_runs\` DROP FOREIGN KEY \`FK_marketing_automation_runs_opportunity\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`marketing_automation_runs\` DROP FOREIGN KEY \`FK_marketing_automation_runs_rule\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`marketing_automation_runs\` DROP FOREIGN KEY \`FK_marketing_automation_runs_organization\`
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS \`marketing_automation_runs\``);
    await queryRunner.query(`
      ALTER TABLE \`marketing_automation_rules\` DROP FOREIGN KEY \`FK_marketing_automation_rules_updated_by\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`marketing_automation_rules\` DROP FOREIGN KEY \`FK_marketing_automation_rules_created_by\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`marketing_automation_rules\` DROP FOREIGN KEY \`FK_marketing_automation_rules_organization\`
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS \`marketing_automation_rules\``);
  }
}
