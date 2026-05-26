import type { MigrationInterface, QueryRunner } from "typeorm";

export class InvoiceV1Professionalization1779705000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`organization_settings\`
        ADD COLUMN \`logo_url\` varchar(1024) NULL AFTER \`invoice_pdf_footer\`,
        ADD COLUMN \`accent_color\` varchar(16) NULL AFTER \`logo_url\`,
        ADD COLUMN \`payment_instructions\` text NULL AFTER \`accent_color\`,
        ADD COLUMN \`business_license\` varchar(128) NULL AFTER \`payment_instructions\`,
        ADD COLUMN \`gst_number\` varchar(128) NULL AFTER \`business_license\`,
        ADD COLUMN \`warranty_message\` text NULL AFTER \`gst_number\`,
        ADD COLUMN \`default_due_days\` int NULL AFTER \`warranty_message\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`invoices\`
        ADD COLUMN \`due_at\` datetime(6) NULL AFTER \`issued_at\`,
        ADD COLUMN \`branding_snapshot_json\` text NULL AFTER \`last_sent_via\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`invoices\`
        DROP COLUMN \`branding_snapshot_json\`,
        DROP COLUMN \`due_at\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`organization_settings\`
        DROP COLUMN \`default_due_days\`,
        DROP COLUMN \`warranty_message\`,
        DROP COLUMN \`gst_number\`,
        DROP COLUMN \`business_license\`,
        DROP COLUMN \`payment_instructions\`,
        DROP COLUMN \`accent_color\`,
        DROP COLUMN \`logo_url\`
    `);
  }
}
