import { MigrationInterface, QueryRunner } from "typeorm";

export class PortalOtpBookingContext1796100000000 implements MigrationInterface {
  name = "PortalOtpBookingContext1796100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`portal_email_otp_challenges\`
      ADD COLUMN \`purpose\` enum('login', 'booking_welcome') NOT NULL DEFAULT 'login'
    `);
    await queryRunner.query(`
      ALTER TABLE \`portal_email_otp_challenges\`
      ADD COLUMN \`context_redirect_path\` varchar(512) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`portal_email_otp_challenges\`
      ADD COLUMN \`context_job_id\` varchar(36) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`portal_email_otp_challenges\` DROP COLUMN \`context_job_id\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`portal_email_otp_challenges\` DROP COLUMN \`context_redirect_path\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`portal_email_otp_challenges\` DROP COLUMN \`purpose\`
    `);
  }
}
