import { MigrationInterface, QueryRunner } from "typeorm";

const jobStatusEnum =
  "'new_lead','contacted','submitted','scheduled','on_the_way','in_progress','waiting_for_approval','completed','paid','cancelled'";

export class JobStatusSubmitted1793000000000 implements MigrationInterface {
  name = "JobStatusSubmitted1793000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`jobs\` MODIFY \`status\` enum (${jobStatusEnum}) NOT NULL DEFAULT 'submitted'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`job_status_events\` MODIFY \`status\` enum (${jobStatusEnum}) NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const legacyEnum =
      "'new_lead','contacted','scheduled','on_the_way','in_progress','waiting_for_approval','completed','paid','cancelled'";

    await queryRunner.query(
      `UPDATE \`jobs\` SET \`status\` = 'new_lead' WHERE \`status\` = 'submitted'`,
    );
    await queryRunner.query(
      `UPDATE \`job_status_events\` SET \`status\` = 'new_lead' WHERE \`status\` = 'submitted'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`jobs\` MODIFY \`status\` enum (${legacyEnum}) NOT NULL DEFAULT 'new_lead'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`job_status_events\` MODIFY \`status\` enum (${legacyEnum}) NOT NULL`,
    );
  }
}
