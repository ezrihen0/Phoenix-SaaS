import { MigrationInterface, QueryRunner } from "typeorm";

export class JobsOperationalType1780000000000 implements MigrationInterface {
  name = "JobsOperationalType1780000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`jobs\`
      ADD COLUMN \`job_type\` enum('inspection', 'installation_repair', 'callback_warranty') NOT NULL DEFAULT 'inspection'
    `);

    await queryRunner.query(`
      UPDATE \`jobs\`
      SET \`job_type\` = 'inspection'
      WHERE \`requested_service_type\` = 'inspection'
    `);

    await queryRunner.query(`
      UPDATE \`jobs\`
      SET \`job_type\` = 'installation_repair'
      WHERE \`requested_service_type\` IN ('repair', 'rebuild', 'cleaning')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE `jobs` DROP COLUMN `job_type`");
  }
}
