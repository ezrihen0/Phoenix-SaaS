import { MigrationInterface, QueryRunner } from "typeorm";

export class PricebookSystems1785400000000 implements MigrationInterface {
  name = "PricebookSystems1785400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`pricebook_systems\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NULL,
        \`name\` varchar(120) NOT NULL,
        \`code\` varchar(64) NOT NULL,
        \`created_by_user_id\` varchar(36) NULL,
        \`updated_by_user_id\` varchar(36) NULL,
        \`deleted_by_user_id\` varchar(36) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`archived_at\` datetime(6) NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`ux_pricebook_systems_org_code\` (\`organization_id\`, \`code\`),
        UNIQUE INDEX \`ux_pricebook_systems_org_name\` (\`organization_id\`, \`name\`),
        CONSTRAINT \`FK_pricebook_systems_organization\`
          FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      ALTER TABLE \`pricebook_categories\`
      ADD COLUMN \`system_id\` varchar(36) NULL,
      ADD INDEX \`ix_pricebook_categories_system_id\` (\`system_id\`),
      ADD INDEX \`ix_pricebook_categories_organization_id\` (\`organization_id\`),
      ADD UNIQUE INDEX \`ux_pricebook_categories_org_system_name\` (\`organization_id\`, \`system_id\`, \`name\`)
    `);

    await queryRunner.query(`
      ALTER TABLE \`pricebook_categories\`
      ADD CONSTRAINT \`FK_pricebook_categories_system\`
        FOREIGN KEY (\`system_id\`) REFERENCES \`pricebook_systems\`(\`id\`)
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE \`pricebook_categories\`
      DROP INDEX \`ux_pricebook_categories_org_name\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`pricebook_categories\`
      DROP FOREIGN KEY \`FK_pricebook_categories_system\`,
      DROP INDEX \`ux_pricebook_categories_org_system_name\`,
      DROP INDEX \`ix_pricebook_categories_system_id\`,
      DROP INDEX \`ix_pricebook_categories_organization_id\`,
      DROP COLUMN \`system_id\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`pricebook_categories\`
      ADD UNIQUE INDEX \`ux_pricebook_categories_org_name\` (\`organization_id\`, \`name\`)
    `);

    await queryRunner.query("DROP TABLE IF EXISTS `pricebook_systems`");
  }
}
