import { MigrationInterface, QueryRunner } from "typeorm";

export class LeadProspectCustomerLifecycle1779698400000 implements MigrationInterface {
  name = "LeadProspectCustomerLifecycle1779698400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`customers\`
        ADD COLUMN \`lifecycle_status\` enum ('prospect', 'active', 'past', 'archived') NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`leads\`
        ADD COLUMN \`customer_id\` varchar(36) NULL
    `);

    await queryRunner.query(`
      CREATE INDEX \`IDX_customers_org_lifecycle\`
        ON \`customers\` (\`organization_id\`, \`lifecycle_status\`)
    `);

    await queryRunner.query(`
      CREATE INDEX \`IDX_leads_org_customer\`
        ON \`leads\` (\`organization_id\`, \`customer_id\`)
    `);

    await queryRunner.query(`
      CREATE INDEX \`IDX_leads_org_status\`
        ON \`leads\` (\`organization_id\`, \`status\`)
    `);

    await queryRunner.query(`
      ALTER TABLE \`leads\`
        ADD CONSTRAINT \`FK_leads_customer\`
        FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`leads\`
        DROP FOREIGN KEY \`FK_leads_customer\`
    `);

    await queryRunner.query(`
      DROP INDEX \`IDX_leads_org_status\` ON \`leads\`
    `);

    await queryRunner.query(`
      DROP INDEX \`IDX_leads_org_customer\` ON \`leads\`
    `);

    await queryRunner.query(`
      DROP INDEX \`IDX_customers_org_lifecycle\` ON \`customers\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`leads\`
        DROP COLUMN \`customer_id\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`customers\`
        DROP COLUMN \`lifecycle_status\`
    `);
  }
}

