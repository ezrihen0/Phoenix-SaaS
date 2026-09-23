import type { MigrationInterface, QueryRunner } from "typeorm";

export class FinancePart6Part7Foundation1788000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`finance_audit_events\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`actor_profile_id\` varchar(36) NULL,
        \`entity_type\` varchar(64) NOT NULL,
        \`entity_id\` varchar(36) NOT NULL,
        \`action\` varchar(64) NOT NULL,
        \`metadata_json\` text NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`IDX_finance_audit_events_org_created\` (\`organization_id\`, \`created_at\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      ALTER TABLE \`finance_audit_events\`
      ADD CONSTRAINT \`FK_finance_audit_events_organization\`
      FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE \`finance_audit_events\`
      ADD CONSTRAINT \`FK_finance_audit_events_actor_profile\`
      FOREIGN KEY (\`actor_profile_id\`) REFERENCES \`profiles\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`finance_audit_events\`
      DROP FOREIGN KEY \`FK_finance_audit_events_actor_profile\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`finance_audit_events\`
      DROP FOREIGN KEY \`FK_finance_audit_events_organization\`
    `);
    await queryRunner.query("DROP TABLE `finance_audit_events`");
  }
}
