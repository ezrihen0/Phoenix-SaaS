import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Invoices, payments, and stored invoice PDFs must survive a job delete.
 * The invoice.job_id foreign key changes from ON DELETE CASCADE to ON DELETE RESTRICT.
 * Payment and document rows stay cascaded from the invoice; they are unreachable
 * through a job delete once the invoice row itself cannot be removed.
 */
export class InvoiceJobDeleteRestrict1792000000000 implements MigrationInterface {
  name = "InvoiceJobDeleteRestrict1792000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ CONSTRAINT_NAME: string }> = await queryRunner.query(`
      SELECT CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'invoices'
        AND COLUMN_NAME = 'job_id'
        AND REFERENCED_TABLE_NAME = 'jobs'
    `);

    if (rows.length !== 1 || !rows[0]?.CONSTRAINT_NAME) {
      throw new Error(
        `invoice_job_fk_lookup_failed:${rows.map((row) => row.CONSTRAINT_NAME).join(",") || "none"}`,
      );
    }

    const constraintName = rows[0].CONSTRAINT_NAME.replace(/`/g, "");
    await queryRunner.query(
      `ALTER TABLE \`invoices\` DROP FOREIGN KEY \`${constraintName}\``,
    );
    await queryRunner.query(`
      ALTER TABLE \`invoices\`
      ADD CONSTRAINT \`${constraintName}\`
      FOREIGN KEY (\`job_id\`) REFERENCES \`jobs\`(\`id\`)
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ CONSTRAINT_NAME: string }> = await queryRunner.query(`
      SELECT CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'invoices'
        AND COLUMN_NAME = 'job_id'
        AND REFERENCED_TABLE_NAME = 'jobs'
    `);

    if (rows.length !== 1 || !rows[0]?.CONSTRAINT_NAME) {
      throw new Error(
        `invoice_job_fk_lookup_failed:${rows.map((row) => row.CONSTRAINT_NAME).join(",") || "none"}`,
      );
    }

    const constraintName = rows[0].CONSTRAINT_NAME.replace(/`/g, "");
    await queryRunner.query(
      `ALTER TABLE \`invoices\` DROP FOREIGN KEY \`${constraintName}\``,
    );
    await queryRunner.query(`
      ALTER TABLE \`invoices\`
      ADD CONSTRAINT \`${constraintName}\`
      FOREIGN KEY (\`job_id\`) REFERENCES \`jobs\`(\`id\`)
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }
}
