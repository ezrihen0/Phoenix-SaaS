import type { MigrationInterface, QueryRunner } from "typeorm";

export class InvoiceTemplateSettings1778861000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`organization_settings\`
        ADD COLUMN \`invoice_email_subject\` varchar(255) NULL AFTER \`business_hours\`,
        ADD COLUMN \`invoice_email_body\` text NULL AFTER \`invoice_email_subject\`,
        ADD COLUMN \`invoice_sms_body\` varchar(480) NULL AFTER \`invoice_email_body\`,
        ADD COLUMN \`invoice_pdf_footer\` varchar(255) NULL AFTER \`invoice_sms_body\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`organization_settings\`
        DROP COLUMN \`invoice_email_subject\`,
        DROP COLUMN \`invoice_email_body\`,
        DROP COLUMN \`invoice_sms_body\`,
        DROP COLUMN \`invoice_pdf_footer\`
    `);
  }
}
