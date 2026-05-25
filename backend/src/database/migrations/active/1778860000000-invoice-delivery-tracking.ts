import type { MigrationInterface, QueryRunner } from "typeorm";

export class InvoiceDeliveryTracking1778860000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`invoices\`
        ADD COLUMN \`email_sent_at\` datetime(6) NULL AFTER \`signed_by_name\`,
        ADD COLUMN \`sms_sent_at\` datetime(6) NULL AFTER \`email_sent_at\`,
        ADD COLUMN \`last_sent_at\` datetime(6) NULL AFTER \`sms_sent_at\`,
        ADD COLUMN \`last_sent_via\` varchar(16) NULL AFTER \`last_sent_at\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`invoices\`
        DROP COLUMN \`email_sent_at\`,
        DROP COLUMN \`sms_sent_at\`,
        DROP COLUMN \`last_sent_at\`,
        DROP COLUMN \`last_sent_via\`
    `);
  }
}
