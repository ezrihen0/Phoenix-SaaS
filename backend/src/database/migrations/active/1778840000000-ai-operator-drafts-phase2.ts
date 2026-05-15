import { MigrationInterface, QueryRunner } from "typeorm";

export class AiOperatorDraftsPhase21778840000000 implements MigrationInterface {
  name = "AiOperatorDraftsPhase21778840000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`ai_operator_drafts\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`actor_profile_id\` varchar(36) NOT NULL,
        \`recent_call_id\` varchar(36) NOT NULL,
        \`draft_type\` varchar(64) NOT NULL,
        \`status\` varchar(32) NOT NULL DEFAULT 'active',
        \`generated_body\` text NOT NULL,
        \`edited_body\` text NULL,
        \`recommendation_run_id\` varchar(36) NULL,
        \`limitations_json\` text NOT NULL,
        \`prompt_version\` varchar(64) NOT NULL,
        \`model_id\` varchar(191) NULL,
        \`dismissed_at\` datetime(6) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_ai_operator_drafts_org_recent_type\` (\`organization_id\`, \`recent_call_id\`, \`draft_type\`),
        INDEX \`IDX_ai_operator_drafts_org_status\` (\`organization_id\`, \`status\`),
        CONSTRAINT \`FK_ai_operator_drafts_organization\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_ai_operator_drafts_actor_profile\` FOREIGN KEY (\`actor_profile_id\`) REFERENCES \`profiles\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_ai_operator_drafts_recent_call\` FOREIGN KEY (\`recent_call_id\`) REFERENCES \`recent_calls\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_ai_operator_drafts_recommendation_run\` FOREIGN KEY (\`recommendation_run_id\`) REFERENCES \`ai_recommendation_runs\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`ai_operator_drafts\` DROP FOREIGN KEY \`FK_ai_operator_drafts_recommendation_run\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`ai_operator_drafts\` DROP FOREIGN KEY \`FK_ai_operator_drafts_recent_call\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`ai_operator_drafts\` DROP FOREIGN KEY \`FK_ai_operator_drafts_actor_profile\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`ai_operator_drafts\` DROP FOREIGN KEY \`FK_ai_operator_drafts_organization\`
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS \`ai_operator_drafts\``);
  }
}
