import type { MigrationInterface, QueryRunner } from "typeorm";

export class WarrantyCertificates1779706000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`warranty_certificates\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NULL,
        \`customer_id\` varchar(36) NOT NULL,
        \`related_invoice_id\` varchar(36) NULL,
        \`related_job_id\` varchar(36) NULL,
        \`warranty_type\` varchar(64) NOT NULL DEFAULT 'installation',
        \`warranty_start_date\` datetime(6) NOT NULL,
        \`warranty_end_date\` datetime(6) NOT NULL,
        \`coverage_text\` text NOT NULL,
        \`exclusions_text\` text NOT NULL,
        \`issued_by_user_id\` varchar(36) NULL,
        \`snapshot_company_name\` varchar(255) NULL,
        \`snapshot_company_logo_url\` varchar(1024) NULL,
        \`snapshot_company_phone\` varchar(64) NULL,
        \`snapshot_company_email\` varchar(320) NULL,
        \`snapshot_company_website\` varchar(255) NULL,
        \`snapshot_company_address\` varchar(255) NULL,
        \`snapshot_company_license\` varchar(255) NULL,
        \`snapshot_company_tax_number\` varchar(255) NULL,
        \`snapshot_accent_color\` varchar(16) NULL,
        \`snapshot_payload_json\` longtext NOT NULL,
        \`generated_html_snapshot\` longtext NULL,
        \`generated_pdf_path\` varchar(1024) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_warranty_certificates_org_customer_created\` (\`organization_id\`, \`customer_id\`, \`created_at\`),
        INDEX \`IDX_warranty_certificates_org_invoice\` (\`organization_id\`, \`related_invoice_id\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      ALTER TABLE \`warranty_certificates\`
      ADD CONSTRAINT \`FK_warranty_certificates_organization\`
      FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE \`warranty_certificates\`
      ADD CONSTRAINT \`FK_warranty_certificates_customer\`
      FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE \`warranty_certificates\`
      ADD CONSTRAINT \`FK_warranty_certificates_invoice\`
      FOREIGN KEY (\`related_invoice_id\`) REFERENCES \`invoices\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE \`warranty_certificates\`
      ADD CONSTRAINT \`FK_warranty_certificates_job\`
      FOREIGN KEY (\`related_job_id\`) REFERENCES \`jobs\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE \`warranty_certificates\`
      ADD CONSTRAINT \`FK_warranty_certificates_issued_user\`
      FOREIGN KEY (\`issued_by_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE `warranty_certificates` DROP FOREIGN KEY `FK_warranty_certificates_issued_user`");
    await queryRunner.query("ALTER TABLE `warranty_certificates` DROP FOREIGN KEY `FK_warranty_certificates_job`");
    await queryRunner.query("ALTER TABLE `warranty_certificates` DROP FOREIGN KEY `FK_warranty_certificates_invoice`");
    await queryRunner.query("ALTER TABLE `warranty_certificates` DROP FOREIGN KEY `FK_warranty_certificates_customer`");
    await queryRunner.query("ALTER TABLE `warranty_certificates` DROP FOREIGN KEY `FK_warranty_certificates_organization`");
    await queryRunner.query("DROP TABLE `warranty_certificates`");
  }
}
