import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * AI Actions V1 — queryable telemetry columns on `ai_recommendation_runs`
 * for unified action runs and owner usage aggregates.
 */
export class AiRecommendationRunsActionTelemetry1778900000000 implements MigrationInterface {
  name = "AiRecommendationRunsActionTelemetry1778900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`ai_recommendation_runs\`
        ADD \`action_key\` varchar(64) NULL,
        ADD \`provider\` varchar(32) NULL,
        ADD \`input_tokens\` int NULL,
        ADD \`output_tokens\` int NULL,
        ADD \`estimated_cost_usd\` decimal(12,6) NULL,
        ADD \`latency_ms\` int NULL,
        ADD \`clicked_action\` tinyint(1) NULL,
        ADD \`outcome_key\` varchar(64) NULL
    `);
    await queryRunner.query(`
      CREATE INDEX \`IDX_ai_recommendation_runs_org_action_created\`
        ON \`ai_recommendation_runs\` (\`organization_id\`, \`action_key\`, \`created_at\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_ai_recommendation_runs_org_action_created\` ON \`ai_recommendation_runs\``,
    );
    await queryRunner.query(`
      ALTER TABLE \`ai_recommendation_runs\`
        DROP COLUMN \`outcome_key\`,
        DROP COLUMN \`clicked_action\`,
        DROP COLUMN \`latency_ms\`,
        DROP COLUMN \`estimated_cost_usd\`,
        DROP COLUMN \`output_tokens\`,
        DROP COLUMN \`input_tokens\`,
        DROP COLUMN \`provider\`,
        DROP COLUMN \`action_key\`
    `);
  }
}
