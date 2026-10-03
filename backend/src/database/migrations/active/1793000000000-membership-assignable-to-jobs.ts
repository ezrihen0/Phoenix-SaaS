import { MigrationInterface, QueryRunner } from "typeorm";

export class MembershipAssignableToJobs1793000000000 implements MigrationInterface {
  name = "MembershipAssignableToJobs1793000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`memberships\`
        ADD COLUMN \`assignable_to_jobs\` tinyint(1) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`memberships\`
        DROP COLUMN \`assignable_to_jobs\`
    `);
  }
}
