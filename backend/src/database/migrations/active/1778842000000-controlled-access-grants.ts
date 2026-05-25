import { MigrationInterface, QueryRunner } from "typeorm";

export class ControlledAccessGrants1778842000000 implements MigrationInterface {
  name = "ControlledAccessGrants1778842000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`controlled_access_grants\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`grant_type\` enum ('pilot', 'field_partner', 'owner_internal') NOT NULL,
        \`reason_code\` varchar(64) NOT NULL,
        \`starts_at\` datetime(6) NOT NULL,
        \`expires_at\` datetime(6) NOT NULL,
        \`revoked_at\` datetime(6) NULL,
        \`notes\` varchar(1000) NULL,
        \`created_by_user_id\` varchar(36) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_controlled_access_grants_org_window\` (\`organization_id\`, \`starts_at\`, \`expires_at\`),
        INDEX \`IDX_controlled_access_grants_org_revoked\` (\`organization_id\`, \`revoked_at\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_controlled_access_grants_organization\`
          FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_controlled_access_grants_created_by_user\`
          FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS `controlled_access_grants`");
  }
}
