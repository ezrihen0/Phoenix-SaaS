import { MigrationInterface, QueryRunner } from "typeorm";

export class LanguageStoreDocumentLineKeys1778760000000 implements MigrationInterface {
  name = "LanguageStoreDocumentLineKeys1778760000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`quote_line_items\`
      ADD \`document_line_key\` varchar(128) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`invoice_line_items\`
      ADD \`document_line_key\` varchar(128) NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX \`IDX_quote_line_items_quote_document_line_key\`
      ON \`quote_line_items\` (\`quote_id\`, \`document_line_key\`)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX \`IDX_invoice_line_items_invoice_document_line_key\`
      ON \`invoice_line_items\` (\`invoice_id\`, \`document_line_key\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX \`IDX_invoice_line_items_invoice_document_line_key\`
      ON \`invoice_line_items\`
    `);
    await queryRunner.query(`
      DROP INDEX \`IDX_quote_line_items_quote_document_line_key\`
      ON \`quote_line_items\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`invoice_line_items\`
      DROP COLUMN \`document_line_key\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`quote_line_items\`
      DROP COLUMN \`document_line_key\`
    `);
  }
}
