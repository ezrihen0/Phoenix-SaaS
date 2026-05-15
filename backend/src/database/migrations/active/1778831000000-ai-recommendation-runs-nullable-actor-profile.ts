import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 1.5B P3 — webhook/system-driven `ai_recommendation_runs` use `actor_profile_id = NULL`
 * (human dry-runs keep a real profile id).
 */
export class AiRecommendationRunsNullableActorProfile1778831000000 implements MigrationInterface {
  name = "AiRecommendationRunsNullableActorProfile1778831000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`ai_recommendation_runs\` DROP FOREIGN KEY \`FK_ai_recommendation_runs_actor_profile\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`ai_recommendation_runs\` MODIFY COLUMN \`actor_profile_id\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `
        ALTER TABLE \`ai_recommendation_runs\`
        ADD CONSTRAINT \`FK_ai_recommendation_runs_actor_profile\`
        FOREIGN KEY (\`actor_profile_id\`) REFERENCES \`profiles\` (\`id\`)
        ON DELETE CASCADE ON UPDATE NO ACTION
      `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`ai_recommendation_runs\` DROP FOREIGN KEY \`FK_ai_recommendation_runs_actor_profile\``,
    );
    await queryRunner.query(
      `DELETE FROM \`ai_recommendation_runs\` WHERE \`actor_profile_id\` IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`ai_recommendation_runs\` MODIFY COLUMN \`actor_profile_id\` varchar(36) NOT NULL`,
    );
    await queryRunner.query(
      `
        ALTER TABLE \`ai_recommendation_runs\`
        ADD CONSTRAINT \`FK_ai_recommendation_runs_actor_profile\`
        FOREIGN KEY (\`actor_profile_id\`) REFERENCES \`profiles\` (\`id\`)
        ON DELETE CASCADE ON UPDATE NO ACTION
      `,
    );
  }
}
