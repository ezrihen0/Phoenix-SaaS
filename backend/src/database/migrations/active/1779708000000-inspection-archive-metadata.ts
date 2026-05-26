import type { MigrationInterface, QueryRunner } from "typeorm";

export class InspectionArchiveMetadata1779708000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`inspections\`
        ADD COLUMN \`archived_at\` datetime(6) NULL AFTER \`locked_at\`,
        ADD COLUMN \`archived_by_user_id\` varchar(36) NULL AFTER \`archived_at\`,
        ADD COLUMN \`archive_reason_code\` varchar(64) NULL AFTER \`archived_by_user_id\`,
        ADD COLUMN \`archive_reason\` text NULL AFTER \`archive_reason_code\`
    `);

    await queryRunner.query(`
      CREATE INDEX \`IDX_inspections_org_archived_at\` ON \`inspections\` (\`organization_id\`, \`archived_at\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX \`IDX_inspections_org_archived_at\` ON \`inspections\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`inspections\`
        DROP COLUMN \`archive_reason\`,
        DROP COLUMN \`archive_reason_code\`,
        DROP COLUMN \`archived_by_user_id\`,
        DROP COLUMN \`archived_at\`
    `);
  }
}
