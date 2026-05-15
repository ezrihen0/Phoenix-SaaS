import { MigrationInterface, QueryRunner } from "typeorm";

export class AiRecommendationRuns1778810000000 implements MigrationInterface {
  name = "AiRecommendationRuns1778810000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`ai_recommendation_runs\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`actor_profile_id\` varchar(36) NOT NULL,
        \`source_channel\` varchar(32) NOT NULL,
        \`feature_key\` varchar(64) NOT NULL,
        \`tool_trace_json\` text NOT NULL,
        \`model_id\` varchar(191) NULL,
        \`prompt_version\` varchar(64) NOT NULL DEFAULT 'phase0',
        \`status\` varchar(32) NOT NULL,
        \`error_code\` varchar(64) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_ai_recommendation_runs_org_created\` (\`organization_id\`, \`created_at\`),
        CONSTRAINT \`FK_ai_recommendation_runs_organization\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_ai_recommendation_runs_actor_profile\` FOREIGN KEY (\`actor_profile_id\`) REFERENCES \`profiles\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`ai_recommendation_runs\` DROP FOREIGN KEY \`FK_ai_recommendation_runs_actor_profile\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`ai_recommendation_runs\` DROP FOREIGN KEY \`FK_ai_recommendation_runs_organization\`
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS \`ai_recommendation_runs\``);
  }
}
