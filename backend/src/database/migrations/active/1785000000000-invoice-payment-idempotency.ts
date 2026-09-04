import { MigrationInterface, QueryRunner } from "typeorm";

export class InvoicePaymentIdempotency1785000000000 implements MigrationInterface {
  name = "InvoicePaymentIdempotency1785000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`invoice_payments\`
      ADD COLUMN \`idempotency_key\` varchar(64) NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX \`UQ_invoice_payments_org_invoice_idempotency\`
      ON \`invoice_payments\` (\`organization_id\`, \`invoice_id\`, \`idempotency_key\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX \`UQ_invoice_payments_org_invoice_idempotency\` ON \`invoice_payments\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`invoice_payments\`
      DROP COLUMN \`idempotency_key\`
    `);
  }
}
