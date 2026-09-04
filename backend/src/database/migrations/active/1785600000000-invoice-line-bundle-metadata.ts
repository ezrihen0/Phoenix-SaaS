import { MigrationInterface, QueryRunner } from "typeorm";

export class InvoiceLineBundleMetadata1785600000000 implements MigrationInterface {
  name = "InvoiceLineBundleMetadata1785600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`invoice_line_items\`
      ADD COLUMN \`pricebook_bundle_id\` varchar(36) NULL,
      ADD COLUMN \`bundle_requirement_id\` varchar(36) NULL,
      ADD COLUMN \`catalog_unit_price_cents_snapshot\` int NULL,
      ADD INDEX \`ix_invoice_line_items_pricebook_bundle_id\` (\`pricebook_bundle_id\`),
      ADD CONSTRAINT \`FK_invoice_line_items_pricebook_bundle\`
        FOREIGN KEY (\`pricebook_bundle_id\`) REFERENCES \`pricebook_bundles\`(\`id\`)
        ON DELETE SET NULL ON UPDATE NO ACTION,
      ADD CONSTRAINT \`FK_invoice_line_items_bundle_requirement\`
        FOREIGN KEY (\`bundle_requirement_id\`) REFERENCES \`pricebook_bundle_requirements\`(\`id\`)
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE \`quote_line_items\`
      ADD COLUMN \`pricebook_bundle_id\` varchar(36) NULL,
      ADD COLUMN \`bundle_requirement_id\` varchar(36) NULL,
      ADD COLUMN \`catalog_unit_price_cents_snapshot\` int NULL,
      ADD INDEX \`ix_quote_line_items_pricebook_bundle_id\` (\`pricebook_bundle_id\`),
      ADD CONSTRAINT \`FK_quote_line_items_pricebook_bundle\`
        FOREIGN KEY (\`pricebook_bundle_id\`) REFERENCES \`pricebook_bundles\`(\`id\`)
        ON DELETE SET NULL ON UPDATE NO ACTION,
      ADD CONSTRAINT \`FK_quote_line_items_bundle_requirement\`
        FOREIGN KEY (\`bundle_requirement_id\`) REFERENCES \`pricebook_bundle_requirements\`(\`id\`)
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`quote_line_items\`
      DROP FOREIGN KEY \`FK_quote_line_items_bundle_requirement\`,
      DROP FOREIGN KEY \`FK_quote_line_items_pricebook_bundle\`,
      DROP INDEX \`ix_quote_line_items_pricebook_bundle_id\`,
      DROP COLUMN \`catalog_unit_price_cents_snapshot\`,
      DROP COLUMN \`bundle_requirement_id\`,
      DROP COLUMN \`pricebook_bundle_id\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`invoice_line_items\`
      DROP FOREIGN KEY \`FK_invoice_line_items_bundle_requirement\`,
      DROP FOREIGN KEY \`FK_invoice_line_items_pricebook_bundle\`,
      DROP INDEX \`ix_invoice_line_items_pricebook_bundle_id\`,
      DROP COLUMN \`catalog_unit_price_cents_snapshot\`,
      DROP COLUMN \`bundle_requirement_id\`,
      DROP COLUMN \`pricebook_bundle_id\`
    `);
  }
}
