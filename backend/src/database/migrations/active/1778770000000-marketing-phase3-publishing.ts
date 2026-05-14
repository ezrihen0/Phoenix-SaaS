import { MigrationInterface, QueryRunner } from "typeorm";

export class MarketingPhase3Publishing1778770000000 implements MigrationInterface {
  name = "MarketingPhase3Publishing1778770000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE c1 FROM \`marketing_connected_channels\` c1
      INNER JOIN \`marketing_connected_channels\` c2
        ON c1.\`organization_id\` = c2.\`organization_id\`
       AND c1.\`channel_key\` = c2.\`channel_key\`
       AND c1.\`id\` > c2.\`id\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`marketing_connected_channels\`
        ADD \`google_account_resource\` varchar(512) NULL,
        ADD \`google_location_resource\` varchar(512) NULL,
        ADD \`facebook_page_id\` varchar(64) NULL,
        ADD \`encrypted_credentials\` text NULL,
        ADD \`pending_targets_encrypted\` text NULL,
        ADD \`token_expires_at\` datetime(6) NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX \`ux_marketing_connected_channels_org_channel\`
        ON \`marketing_connected_channels\` (\`organization_id\`, \`channel_key\`)
    `);

    await queryRunner.query(`
      CREATE TABLE \`marketing_oauth_states\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`provider\` varchar(16) NOT NULL,
        \`state_token\` varchar(64) NOT NULL,
        \`expires_at\` datetime(6) NOT NULL,
        \`consumed_at\` datetime(6) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`ux_marketing_oauth_states_token\` (\`state_token\`),
        INDEX \`IDX_marketing_oauth_states_org\` (\`organization_id\`),
        INDEX \`IDX_marketing_oauth_states_expires\` (\`expires_at\`),
        CONSTRAINT \`FK_marketing_oauth_states_organization\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`marketing_publish_jobs\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`draft_id\` varchar(36) NOT NULL,
        \`status\` varchar(32) NOT NULL DEFAULT 'queued',
        \`scheduled_at\` datetime(6) NOT NULL,
        \`lease_owner\` varchar(128) NULL,
        \`leased_until\` datetime(6) NULL,
        \`publish_intent\` varchar(32) NOT NULL,
        \`created_by_user_id\` varchar(36) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_marketing_publish_jobs_claim\` (\`status\`, \`scheduled_at\`),
        INDEX \`IDX_marketing_publish_jobs_org_draft\` (\`organization_id\`, \`draft_id\`),
        CONSTRAINT \`FK_marketing_publish_jobs_organization\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_marketing_publish_jobs_draft\` FOREIGN KEY (\`draft_id\`) REFERENCES \`marketing_content_drafts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_marketing_publish_jobs_created_by\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`marketing_publish_attempts\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`publish_job_id\` varchar(36) NOT NULL,
        \`platform_key\` varchar(32) NOT NULL,
        \`attempt_no\` int NOT NULL DEFAULT 1,
        \`status\` varchar(32) NOT NULL,
        \`outcome_code\` varchar(64) NULL,
        \`provider_http_status\` int NULL,
        \`provider_error_json\` text NULL,
        \`external_post_id\` varchar(255) NULL,
        \`started_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`finished_at\` datetime(6) NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_marketing_publish_attempts_job\` (\`publish_job_id\`),
        INDEX \`IDX_marketing_publish_attempts_org\` (\`organization_id\`),
        CONSTRAINT \`FK_marketing_publish_attempts_organization\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_marketing_publish_attempts_job\` FOREIGN KEY (\`publish_job_id\`) REFERENCES \`marketing_publish_jobs\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`marketing_publish_attempts\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`marketing_publish_jobs\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`marketing_oauth_states\``);

    await queryRunner.query(`
      DROP INDEX \`ux_marketing_connected_channels_org_channel\` ON \`marketing_connected_channels\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`marketing_connected_channels\`
        DROP COLUMN \`google_account_resource\`,
        DROP COLUMN \`google_location_resource\`,
        DROP COLUMN \`facebook_page_id\`,
        DROP COLUMN \`encrypted_credentials\`,
        DROP COLUMN \`pending_targets_encrypted\`,
        DROP COLUMN \`token_expires_at\`
    `);
  }
}
