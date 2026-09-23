import type { MigrationInterface, QueryRunner } from "typeorm";

export class FinancePart4Part5Foundation1787000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`invoices\`
      ADD COLUMN \`document_number\` varchar(64) NULL AFTER \`source_quote_id\`,
      ADD COLUMN \`customer_facing_snapshot_json\` text NULL AFTER \`branding_snapshot_json\`,
      ADD COLUMN \`voided_at\` datetime(6) NULL AFTER \`customer_facing_snapshot_json\`,
      ADD COLUMN \`cancelled_at\` datetime(6) NULL AFTER \`voided_at\`
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX \`IDX_invoices_org_document_number\`
      ON \`invoices\` (\`organization_id\`, \`document_number\`)
    `);

    await queryRunner.query(`
      CREATE TABLE \`organization_invoice_sequences\` (
        \`organization_id\` varchar(36) NOT NULL,
        \`next_value\` bigint NOT NULL DEFAULT 1001,
        \`prefix\` varchar(32) NOT NULL DEFAULT '',
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`organization_id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      ALTER TABLE \`organization_invoice_sequences\`
      ADD CONSTRAINT \`FK_organization_invoice_sequences_organization\`
      FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE \`invoice_documents\`
      ADD COLUMN \`generation_sequence\` int NOT NULL DEFAULT 0 AFTER \`document_kind\`,
      ADD COLUMN \`snapshot_hash\` varchar(64) NULL AFTER \`generation_sequence\`,
      ADD COLUMN \`snapshot_frozen_at\` datetime(6) NULL AFTER \`snapshot_hash\`,
      ADD COLUMN \`document_number_at_generation\` varchar(64) NULL AFTER \`snapshot_frozen_at\`,
      ADD COLUMN \`sent_via\` varchar(16) NULL AFTER \`document_number_at_generation\`,
      ADD COLUMN \`renderer_version\` varchar(32) NULL AFTER \`sent_via\`
    `);

    await queryRunner.query(`
      DROP INDEX \`IDX_invoice_documents_org_invoice_kind\` ON \`invoice_documents\`
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX \`IDX_invoice_documents_org_invoice_kind_seq\`
      ON \`invoice_documents\` (\`organization_id\`, \`invoice_id\`, \`document_kind\`, \`generation_sequence\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX \`IDX_invoice_documents_org_invoice_kind_seq\` ON \`invoice_documents\`
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX \`IDX_invoice_documents_org_invoice_kind\`
      ON \`invoice_documents\` (\`organization_id\`, \`invoice_id\`, \`document_kind\`)
    `);

    await queryRunner.query(`
      ALTER TABLE \`invoice_documents\`
      DROP COLUMN \`renderer_version\`,
      DROP COLUMN \`sent_via\`,
      DROP COLUMN \`document_number_at_generation\`,
      DROP COLUMN \`snapshot_frozen_at\`,
      DROP COLUMN \`snapshot_hash\`,
      DROP COLUMN \`generation_sequence\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`organization_invoice_sequences\`
      DROP FOREIGN KEY \`FK_organization_invoice_sequences_organization\`
    `);
    await queryRunner.query("DROP TABLE `organization_invoice_sequences`");

    await queryRunner.query(`
      DROP INDEX \`IDX_invoices_org_document_number\` ON \`invoices\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`invoices\`
      DROP COLUMN \`cancelled_at\`,
      DROP COLUMN \`voided_at\`,
      DROP COLUMN \`customer_facing_snapshot_json\`,
      DROP COLUMN \`document_number\`
    `);
  }
}
