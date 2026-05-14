import { MigrationInterface, QueryRunner } from "typeorm";

export class LanguageStoreTranslationContractClosure1778750000000 implements MigrationInterface {
  name = "LanguageStoreTranslationContractClosure1778750000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`customer_output_translation_records\`
      ADD \`document_kind\` varchar(16) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`customer_output_translation_records\`
      ADD \`document_id\` varchar(36) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`customer_output_translation_records\`
      ADD \`document_line_key\` varchar(128) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`customer_output_translation_records\`
      ADD \`field_key\` varchar(32) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`customer_output_translation_records\`
      ADD \`final_text\` text NULL
    `);
    await queryRunner.query(`
      CREATE INDEX \`IDX_customer_output_translation_records_org_document\`
      ON \`customer_output_translation_records\` (\`organization_id\`, \`document_kind\`, \`document_id\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX \`IDX_customer_output_translation_records_org_document\`
      ON \`customer_output_translation_records\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`customer_output_translation_records\`
      DROP COLUMN \`final_text\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`customer_output_translation_records\`
      DROP COLUMN \`field_key\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`customer_output_translation_records\`
      DROP COLUMN \`document_line_key\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`customer_output_translation_records\`
      DROP COLUMN \`document_id\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`customer_output_translation_records\`
      DROP COLUMN \`document_kind\`
    `);
  }
}
