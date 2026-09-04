import { MigrationInterface, QueryRunner } from "typeorm";

export class PricebookItemImage1785200000000 implements MigrationInterface {
  name = "PricebookItemImage1785200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`pricebook_items\`
      ADD COLUMN \`image_storage_key\` varchar(255) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`pricebook_items\`
      DROP COLUMN \`image_storage_key\`
    `);
  }
}
