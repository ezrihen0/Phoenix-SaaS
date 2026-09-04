import { MigrationInterface, QueryRunner } from "typeorm";

export class PlatformOperatorGrants1784000000000 implements MigrationInterface {
  name = "PlatformOperatorGrants1784000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`platform_operator_grants\` (
        \`id\` varchar(36) NOT NULL,
        \`user_id\` varchar(36) NOT NULL,
        \`capability\` enum ('organizations.create_standalone', 'organizations.create_unlimited') NOT NULL,
        \`granted_at\` datetime(6) NOT NULL,
        \`granted_by_user_id\` varchar(36) NULL,
        \`revoked_at\` datetime(6) NULL,
        \`notes\` varchar(1000) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`ux_platform_operator_grants_user_capability\` (\`user_id\`, \`capability\`),
        INDEX \`IDX_platform_operator_grants_user_revoked\` (\`user_id\`, \`revoked_at\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_platform_operator_grants_user\`
          FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_platform_operator_grants_granted_by_user\`
          FOREIGN KEY (\`granted_by_user_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS `platform_operator_grants`");
  }
}
