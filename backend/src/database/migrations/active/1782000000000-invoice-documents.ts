import type { MigrationInterface, QueryRunner } from "typeorm";

export class InvoiceDocuments1782000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`invoice_documents\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NULL,
        \`customer_id\` varchar(36) NOT NULL,
        \`invoice_id\` varchar(36) NOT NULL,
        \`document_kind\` varchar(64) NOT NULL,
        \`storage_key\` varchar(512) NOT NULL,
        \`storage_path\` varchar(1024) NOT NULL,
        \`file_hash\` varchar(64) NOT NULL,
        \`original_filename\` varchar(255) NOT NULL,
        \`mime_type\` varchar(128) NOT NULL DEFAULT 'application/pdf',
        \`import_source\` varchar(64) NOT NULL DEFAULT 'workiz_historical_import',
        \`workiz_invoice_code\` varchar(32) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`IDX_invoice_documents_org_invoice_kind\` (\`organization_id\`, \`invoice_id\`, \`document_kind\`),
        UNIQUE INDEX \`IDX_invoice_documents_org_invoice_hash\` (\`organization_id\`, \`invoice_id\`, \`file_hash\`),
        INDEX \`IDX_invoice_documents_org_customer\` (\`organization_id\`, \`customer_id\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      ALTER TABLE \`invoice_documents\`
      ADD CONSTRAINT \`FK_invoice_documents_organization\`
      FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE \`invoice_documents\`
      ADD CONSTRAINT \`FK_invoice_documents_customer\`
      FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE \`invoice_documents\`
      ADD CONSTRAINT \`FK_invoice_documents_invoice\`
      FOREIGN KEY (\`invoice_id\`) REFERENCES \`invoices\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE `invoice_documents` DROP FOREIGN KEY `FK_invoice_documents_invoice`");
    await queryRunner.query("ALTER TABLE `invoice_documents` DROP FOREIGN KEY `FK_invoice_documents_customer`");
    await queryRunner.query("ALTER TABLE `invoice_documents` DROP FOREIGN KEY `FK_invoice_documents_organization`");
    await queryRunner.query("DROP TABLE `invoice_documents`");
  }
}
