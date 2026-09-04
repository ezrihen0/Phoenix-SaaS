import { MigrationInterface, QueryRunner } from "typeorm";

export class PricebookCategories1785300000000 implements MigrationInterface {
  name = "PricebookCategories1785300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`pricebook_categories\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NULL,
        \`name\` varchar(120) NOT NULL,
        \`created_by_user_id\` varchar(36) NULL,
        \`updated_by_user_id\` varchar(36) NULL,
        \`deleted_by_user_id\` varchar(36) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`archived_at\` datetime(6) NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`ux_pricebook_categories_org_name\` (\`organization_id\`, \`name\`),
        CONSTRAINT \`FK_pricebook_categories_organization\`
          FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      ALTER TABLE \`pricebook_items\`
      ADD COLUMN \`category_id\` varchar(36) NULL,
      ADD INDEX \`ix_pricebook_items_category_id\` (\`category_id\`),
      ADD CONSTRAINT \`FK_pricebook_items_category\`
        FOREIGN KEY (\`category_id\`) REFERENCES \`pricebook_categories\`(\`id\`)
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`pricebook_items\`
      DROP FOREIGN KEY \`FK_pricebook_items_category\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`pricebook_items\`
      DROP INDEX \`ix_pricebook_items_category_id\`,
      DROP COLUMN \`category_id\`
    `);
    await queryRunner.query("DROP TABLE IF EXISTS `pricebook_categories`");
  }
}
