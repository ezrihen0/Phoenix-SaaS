import { MigrationInterface, QueryRunner } from "typeorm";

export class PricebookBundleRequirements1785500000000 implements MigrationInterface {
  name = "PricebookBundleRequirements1785500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`pricebook_bundle_requirements\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NULL,
        \`bundle_id\` varchar(36) NOT NULL,
        \`label\` varchar(255) NOT NULL,
        \`category_id\` varchar(36) NOT NULL,
        \`default_quantity\` decimal(10,3) NOT NULL DEFAULT '1.000',
        \`sort_order\` int NOT NULL DEFAULT '0',
        \`created_by_user_id\` varchar(36) NULL,
        \`updated_by_user_id\` varchar(36) NULL,
        \`deleted_by_user_id\` varchar(36) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`archived_at\` datetime(6) NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`ix_pricebook_bundle_requirements_bundle_id\` (\`bundle_id\`),
        INDEX \`ix_pricebook_bundle_requirements_category_id\` (\`category_id\`),
        CONSTRAINT \`FK_pricebook_bundle_requirements_bundle\`
          FOREIGN KEY (\`bundle_id\`) REFERENCES \`pricebook_bundles\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_pricebook_bundle_requirements_category\`
          FOREIGN KEY (\`category_id\`) REFERENCES \`pricebook_categories\`(\`id\`)
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT \`FK_pricebook_bundle_requirements_organization\`
          FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS `pricebook_bundle_requirements`");
  }
}
