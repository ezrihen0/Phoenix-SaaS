import type { MigrationInterface, QueryRunner } from "typeorm";

export class QuoteCustomerFacingSnapshot1791000000000 implements MigrationInterface {
  name = "QuoteCustomerFacingSnapshot1791000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`quotes\`
      ADD COLUMN \`customer_facing_snapshot_json\` text NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`quotes\`
      DROP COLUMN \`customer_facing_snapshot_json\`
    `);
  }
}
