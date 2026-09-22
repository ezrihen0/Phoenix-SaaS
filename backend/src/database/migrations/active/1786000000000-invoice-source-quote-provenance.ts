import { MigrationInterface, QueryRunner } from "typeorm";

export class InvoiceSourceQuoteProvenance1786000000000 implements MigrationInterface {
  name = "InvoiceSourceQuoteProvenance1786000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`invoices\`
      ADD COLUMN \`source_quote_id\` varchar(36) NULL,
      ADD CONSTRAINT \`FK_invoices_source_quote\`
        FOREIGN KEY (\`source_quote_id\`) REFERENCES \`quotes\`(\`id\`)
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`invoices\`
      DROP FOREIGN KEY \`FK_invoices_source_quote\`,
      DROP COLUMN \`source_quote_id\`
    `);
  }
}
