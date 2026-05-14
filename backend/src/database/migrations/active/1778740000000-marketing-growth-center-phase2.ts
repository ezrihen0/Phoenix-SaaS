import { MigrationInterface, QueryRunner } from "typeorm";

export class MarketingGrowthCenterPhase21778740000000 implements MigrationInterface {
  name = "MarketingGrowthCenterPhase21778740000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`marketing_profiles\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`identity_json\` text NULL,
        \`brand_voice_json\` text NULL,
        \`publishing_preferences_json\` text NULL,
        \`safety_preferences_json\` text NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`ux_marketing_profiles_organization\` (\`organization_id\`),
        CONSTRAINT \`FK_marketing_profiles_organization\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`marketing_connected_channels\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`channel_key\` varchar(64) NOT NULL,
        \`channel_label\` varchar(128) NULL,
        \`connection_status\` varchar(32) NOT NULL DEFAULT 'disconnected',
        \`account_label\` varchar(255) NULL,
        \`authorization_health\` varchar(64) NULL,
        \`permissions_status\` varchar(64) NULL,
        \`last_published_at\` datetime(6) NULL,
        \`last_failure_at\` datetime(6) NULL,
        \`metadata_json\` text NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_marketing_connected_channels_org\` (\`organization_id\`),
        CONSTRAINT \`FK_marketing_connected_channels_organization\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`marketing_opportunities\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`opportunity_type\` varchar(64) NOT NULL,
        \`status\` varchar(32) NOT NULL DEFAULT 'detected',
        \`title\` varchar(255) NOT NULL,
        \`summary\` text NULL,
        \`source\` varchar(64) NULL,
        \`source_entity_type\` varchar(64) NULL,
        \`source_entity_id\` varchar(64) NULL,
        \`payload_json\` text NULL,
        \`occurred_at\` datetime(6) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_marketing_opportunities_org\` (\`organization_id\`),
        CONSTRAINT \`FK_marketing_opportunities_organization\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`marketing_content_drafts\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`created_by_user_id\` varchar(36) NULL,
        \`updated_by_user_id\` varchar(36) NULL,
        \`title\` varchar(255) NOT NULL DEFAULT '',
        \`intent\` varchar(64) NULL,
        \`notes\` text NULL,
        \`workflow_state\` varchar(32) NOT NULL DEFAULT 'draft',
        \`scheduled_at\` datetime(6) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_marketing_content_drafts_org_state\` (\`organization_id\`, \`workflow_state\`),
        INDEX \`IDX_marketing_content_drafts_org_scheduled\` (\`organization_id\`, \`scheduled_at\`),
        CONSTRAINT \`FK_marketing_content_drafts_organization\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_marketing_content_drafts_created_by_user\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT \`FK_marketing_content_drafts_updated_by_user\` FOREIGN KEY (\`updated_by_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`marketing_content_variants\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`draft_id\` varchar(36) NOT NULL,
        \`platform_key\` varchar(32) NOT NULL,
        \`body_json\` text NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`ux_marketing_variant_draft_platform\` (\`draft_id\`, \`platform_key\`),
        INDEX \`IDX_marketing_content_variants_org\` (\`organization_id\`),
        CONSTRAINT \`FK_marketing_content_variants_organization\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_marketing_content_variants_draft\` FOREIGN KEY (\`draft_id\`) REFERENCES \`marketing_content_drafts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`marketing_content_variants\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`marketing_content_drafts\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`marketing_opportunities\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`marketing_connected_channels\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`marketing_profiles\``);
  }
}
