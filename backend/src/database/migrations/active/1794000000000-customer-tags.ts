import { MigrationInterface, QueryRunner } from "typeorm";

export class CustomerTags1794000000000 implements MigrationInterface {
  name = "CustomerTags1794000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`customers\`
        ADD COLUMN \`tags\` json NOT NULL DEFAULT (JSON_ARRAY())
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`customers\`
        DROP COLUMN \`tags\`
    `);
  }
}
