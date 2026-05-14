import { MigrationInterface, QueryRunner } from "typeorm";

export class LanguageStoreFoundation1778720000000 implements MigrationInterface {
  name = "LanguageStoreFoundation1778720000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`organization_enabled_languages\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`language_code\` varchar(16) NOT NULL,
        \`activated_by_user_id\` varchar(36) NULL,
        \`deactivated_at\` datetime(6) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`ux_organization_enabled_languages_org_language\` (\`organization_id\`, \`language_code\`),
        INDEX \`IDX_org_enabled_languages_organization\` (\`organization_id\`),
        CONSTRAINT \`FK_org_enabled_languages_organization\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_org_enabled_languages_activated_by_user\` FOREIGN KEY (\`activated_by_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`user_organization_language_preferences\` (
        \`id\` varchar(36) NOT NULL,
        \`user_id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`language_code\` varchar(16) NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`ux_user_org_language_preferences_user_org\` (\`user_id\`, \`organization_id\`),
        INDEX \`IDX_user_org_language_preferences_org\` (\`organization_id\`),
        CONSTRAINT \`FK_user_org_language_preferences_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_user_org_language_preferences_org\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`user_organization_language_preferences\`
      DROP FOREIGN KEY \`FK_user_org_language_preferences_org\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`user_organization_language_preferences\`
      DROP FOREIGN KEY \`FK_user_org_language_preferences_user\`
    `);
    await queryRunner.query(`
      DROP INDEX \`IDX_user_org_language_preferences_org\`
      ON \`user_organization_language_preferences\`
    `);
    await queryRunner.query(`
      DROP INDEX \`ux_user_org_language_preferences_user_org\`
      ON \`user_organization_language_preferences\`
    `);
    await queryRunner.query(`
      DROP TABLE \`user_organization_language_preferences\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`organization_enabled_languages\`
      DROP FOREIGN KEY \`FK_org_enabled_languages_activated_by_user\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`organization_enabled_languages\`
      DROP FOREIGN KEY \`FK_org_enabled_languages_organization\`
    `);
    await queryRunner.query(`
      DROP INDEX \`IDX_org_enabled_languages_organization\`
      ON \`organization_enabled_languages\`
    `);
    await queryRunner.query(`
      DROP INDEX \`ux_organization_enabled_languages_org_language\`
      ON \`organization_enabled_languages\`
    `);
    await queryRunner.query(`
      DROP TABLE \`organization_enabled_languages\`
    `);
  }
}
