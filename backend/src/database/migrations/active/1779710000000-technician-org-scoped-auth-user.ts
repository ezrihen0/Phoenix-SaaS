import { MigrationInterface, QueryRunner } from "typeorm";

const AUTH_USER_FK_NAME = "FK_0f8bfb29de3a3c61ad347c216ba";
const LEGACY_AUTH_USER_UNIQUE_INDEX = "REL_0f8bfb29de3a3c61ad347c216b";
const AUTH_USER_INDEX = "IDX_technicians_auth_user_id";
const ORG_AUTH_USER_UNIQUE_INDEX = "IDX_technicians_org_auth_user";

export class TechnicianOrgScopedAuthUser1779710000000 implements MigrationInterface {
  name = "TechnicianOrgScopedAuthUser1779710000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`technicians\` t
      INNER JOIN \`memberships\` m
        ON m.user_id = t.auth_user_id
        AND m.status = 'active'
      INNER JOIN (
        SELECT user_id, MIN(created_at) AS first_created_at
        FROM \`memberships\`
        WHERE status = 'active'
        GROUP BY user_id
      ) first_membership
        ON first_membership.user_id = m.user_id
        AND first_membership.first_created_at = m.created_at
      SET t.organization_id = m.organization_id
      WHERE t.organization_id IS NULL
        AND t.auth_user_id IS NOT NULL
    `);

    // MySQL requires dropping the FK before the unique index it depends on.
    await queryRunner.query(`ALTER TABLE \`technicians\` DROP FOREIGN KEY \`${AUTH_USER_FK_NAME}\``);
    await queryRunner.query(`DROP INDEX \`${LEGACY_AUTH_USER_UNIQUE_INDEX}\` ON \`technicians\``);

    await queryRunner.query(`
      CREATE INDEX \`${AUTH_USER_INDEX}\`
      ON \`technicians\` (\`auth_user_id\`)
    `);

    await queryRunner.query(`
      ALTER TABLE \`technicians\`
      ADD CONSTRAINT \`${AUTH_USER_FK_NAME}\`
      FOREIGN KEY (\`auth_user_id\`) REFERENCES \`users\`(\`id\`)
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX \`${ORG_AUTH_USER_UNIQUE_INDEX}\`
      ON \`technicians\` (\`organization_id\`, \`auth_user_id\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`${ORG_AUTH_USER_UNIQUE_INDEX}\` ON \`technicians\``);
    await queryRunner.query(`ALTER TABLE \`technicians\` DROP FOREIGN KEY \`${AUTH_USER_FK_NAME}\``);
    await queryRunner.query(`DROP INDEX \`${AUTH_USER_INDEX}\` ON \`technicians\``);

    await queryRunner.query(`
      CREATE UNIQUE INDEX \`${LEGACY_AUTH_USER_UNIQUE_INDEX}\`
      ON \`technicians\` (\`auth_user_id\`)
    `);

    await queryRunner.query(`
      ALTER TABLE \`technicians\`
      ADD CONSTRAINT \`${AUTH_USER_FK_NAME}\`
      FOREIGN KEY (\`auth_user_id\`) REFERENCES \`users\`(\`id\`)
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }
}
