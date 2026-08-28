import { MigrationInterface, QueryRunner } from "typeorm";

export class TeamPermissionsV11779715000000 implements MigrationInterface {
  name = "TeamPermissionsV11779715000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`organization_team_entitlements\` (
        \`organization_id\` varchar(36) NOT NULL,
        \`max_users\` int NOT NULL DEFAULT 5,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`organization_id\`),
        CONSTRAINT \`FK_organization_team_entitlements_organization\`
          FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`organization_custom_roles\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`name\` varchar(128) NOT NULL,
        \`permission_keys\` json NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`ux_organization_custom_roles_org_name\` (\`organization_id\`, \`name\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_organization_custom_roles_organization\`
          FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`team_rbac_audit_events\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`actor_user_id\` varchar(36) NOT NULL,
        \`target_user_id\` varchar(36) NULL,
        \`action\` varchar(64) NOT NULL,
        \`previous_role\` varchar(32) NULL,
        \`new_role\` varchar(32) NULL,
        \`previous_permissions\` json NULL,
        \`new_permissions\` json NULL,
        \`metadata\` json NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`IDX_team_rbac_audit_events_org_created\` (\`organization_id\`, \`created_at\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_team_rbac_audit_events_organization\`
          FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_team_rbac_audit_events_actor\`
          FOREIGN KEY (\`actor_user_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_team_rbac_audit_events_target\`
          FOREIGN KEY (\`target_user_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      ALTER TABLE \`memberships\`
        ADD COLUMN \`custom_role_id\` varchar(36) NULL,
        ADD COLUMN \`custom_permission_keys\` json NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`memberships\`
        ADD CONSTRAINT \`FK_memberships_custom_role\`
          FOREIGN KEY (\`custom_role_id\`) REFERENCES \`organization_custom_roles\`(\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      INSERT INTO \`organization_team_entitlements\` (\`organization_id\`, \`max_users\`)
      SELECT \`id\`, 5 FROM \`organizations\`
      ON DUPLICATE KEY UPDATE \`max_users\` = \`max_users\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`memberships\`
        DROP FOREIGN KEY \`FK_memberships_custom_role\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`memberships\`
        DROP COLUMN \`custom_role_id\`,
        DROP COLUMN \`custom_permission_keys\`
    `);
    await queryRunner.query("DROP TABLE IF EXISTS `team_rbac_audit_events`");
    await queryRunner.query("DROP TABLE IF EXISTS `organization_custom_roles`");
    await queryRunner.query("DROP TABLE IF EXISTS `organization_team_entitlements`");
  }
}
