import { MigrationInterface, QueryRunner } from "typeorm";

export class MarketingPhase5CampaignBuilder1778790000000 implements MigrationInterface {
  name = "MarketingPhase5CampaignBuilder1778790000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`marketing_campaigns\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`created_by_user_id\` varchar(36) NULL,
        \`updated_by_user_id\` varchar(36) NULL,
        \`campaign_kind\` varchar(64) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`objective_summary\` text NULL,
        \`primary_service_topic\` varchar(255) NULL,
        \`geo_label\` varchar(255) NULL,
        \`geo_normalized\` varchar(191) NULL,
        \`channel_intent_json\` text NULL,
        \`window_starts_at\` datetime(6) NOT NULL,
        \`window_ends_at\` datetime(6) NOT NULL,
        \`status\` varchar(32) NOT NULL DEFAULT 'draft_planning',
        \`plan_snapshot_json\` text NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_marketing_campaigns_org_status\` (\`organization_id\`, \`status\`),
        INDEX \`IDX_marketing_campaigns_org_updated\` (\`organization_id\`, \`updated_at\`),
        CONSTRAINT \`FK_marketing_campaigns_organization\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_marketing_campaigns_created_by\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT \`FK_marketing_campaigns_updated_by\` FOREIGN KEY (\`updated_by_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`marketing_campaign_items\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`campaign_id\` varchar(36) NOT NULL,
        \`sort_order\` int NOT NULL,
        \`slot_key\` varchar(64) NOT NULL,
        \`label\` varchar(255) NOT NULL,
        \`plan_notes\` text NULL,
        \`suggested_scheduled_at\` datetime(6) NULL,
        \`intended_platform_keys_json\` text NULL,
        \`draft_id\` varchar(36) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`ux_marketing_campaign_items_org_draft\` (\`organization_id\`, \`draft_id\`),
        INDEX \`IDX_marketing_campaign_items_campaign_sort\` (\`campaign_id\`, \`sort_order\`),
        INDEX \`IDX_marketing_campaign_items_org\` (\`organization_id\`),
        CONSTRAINT \`FK_marketing_campaign_items_organization\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_marketing_campaign_items_campaign\` FOREIGN KEY (\`campaign_id\`) REFERENCES \`marketing_campaigns\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_marketing_campaign_items_draft\` FOREIGN KEY (\`draft_id\`) REFERENCES \`marketing_content_drafts\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`marketing_campaign_items\` DROP FOREIGN KEY \`FK_marketing_campaign_items_draft\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`marketing_campaign_items\` DROP FOREIGN KEY \`FK_marketing_campaign_items_campaign\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`marketing_campaign_items\` DROP FOREIGN KEY \`FK_marketing_campaign_items_organization\`
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS \`marketing_campaign_items\``);
    await queryRunner.query(`
      ALTER TABLE \`marketing_campaigns\` DROP FOREIGN KEY \`FK_marketing_campaigns_updated_by\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`marketing_campaigns\` DROP FOREIGN KEY \`FK_marketing_campaigns_created_by\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`marketing_campaigns\` DROP FOREIGN KEY \`FK_marketing_campaigns_organization\`
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS \`marketing_campaigns\``);
  }
}
