import { MigrationInterface, QueryRunner } from "typeorm";

export class CoreTenantOwnershipHardening1779711000000 implements MigrationInterface {
  name = "CoreTenantOwnershipHardening1779711000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`quotes\` q
      INNER JOIN \`jobs\` j ON j.id = q.job_id
      SET q.organization_id = j.organization_id
      WHERE q.organization_id IS NULL AND j.organization_id IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE \`invoices\` i
      INNER JOIN \`jobs\` j ON j.id = i.job_id
      SET i.organization_id = j.organization_id
      WHERE i.organization_id IS NULL AND j.organization_id IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE \`invoice_payments\` p
      INNER JOIN \`invoices\` i ON i.id = p.invoice_id
      SET p.organization_id = i.organization_id
      WHERE p.organization_id IS NULL AND i.organization_id IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE \`job_notes\` n
      INNER JOIN \`jobs\` j ON j.id = n.job_id
      SET n.organization_id = j.organization_id
      WHERE n.organization_id IS NULL AND j.organization_id IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE \`job_status_events\` e
      INNER JOIN \`jobs\` j ON j.id = e.job_id
      SET e.organization_id = j.organization_id
      WHERE e.organization_id IS NULL AND j.organization_id IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE \`leads\` l
      LEFT JOIN \`customers\` c ON c.id = l.customer_id
      SET l.organization_id = COALESCE(l.organization_id, c.organization_id)
      WHERE l.organization_id IS NULL AND c.organization_id IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX \`IDX_leads_organization_id\` ON \`leads\` (\`organization_id\`)
    `);
    await queryRunner.query(`
      CREATE INDEX \`IDX_jobs_organization_id\` ON \`jobs\` (\`organization_id\`)
    `);
    await queryRunner.query(`
      CREATE INDEX \`IDX_quotes_organization_id\` ON \`quotes\` (\`organization_id\`)
    `);
    await queryRunner.query(`
      CREATE INDEX \`IDX_invoices_organization_id\` ON \`invoices\` (\`organization_id\`)
    `);
    await queryRunner.query(`
      CREATE INDEX \`IDX_invoice_payments_organization_id\` ON \`invoice_payments\` (\`organization_id\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP INDEX `IDX_invoice_payments_organization_id` ON `invoice_payments`");
    await queryRunner.query("DROP INDEX `IDX_invoices_organization_id` ON `invoices`");
    await queryRunner.query("DROP INDEX `IDX_quotes_organization_id` ON `quotes`");
    await queryRunner.query("DROP INDEX `IDX_jobs_organization_id` ON `jobs`");
    await queryRunner.query("DROP INDEX `IDX_leads_organization_id` ON `leads`");
  }
}
