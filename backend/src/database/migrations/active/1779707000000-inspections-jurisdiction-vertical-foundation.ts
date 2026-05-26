import type { MigrationInterface, QueryRunner } from "typeorm";

export class InspectionsJurisdictionVerticalFoundation1779707000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`inspections\`
        ADD COLUMN \`country_code\` varchar(2) NULL AFTER \`workflow_type\`,
        ADD COLUMN \`region_code\` varchar(8) NULL AFTER \`country_code\`,
        MODIFY COLUMN \`province_code\` varchar(8) NOT NULL DEFAULT 'UNSPEC',
        MODIFY COLUMN \`report_type\` enum ('wood_burning_fireplace', 'wood_stove', 'wett_inspection', 'gas_fireplace', 'garage_door', 'hvac') NOT NULL DEFAULT 'wood_burning_fireplace'
    `);

    await queryRunner.query(`
      UPDATE \`inspections\`
      SET \`region_code\` = UPPER(NULLIF(TRIM(\`province_code\`), ''))
      WHERE \`region_code\` IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`inspections\`
      SET \`report_type\` = 'wood_burning_fireplace'
      WHERE \`report_type\` IN ('garage_door', 'hvac')
    `);

    await queryRunner.query(`
      ALTER TABLE \`inspections\`
        MODIFY COLUMN \`report_type\` enum ('wood_burning_fireplace', 'wood_stove', 'wett_inspection', 'gas_fireplace') NOT NULL DEFAULT 'wood_burning_fireplace',
        MODIFY COLUMN \`province_code\` varchar(8) NOT NULL DEFAULT 'AB',
        DROP COLUMN \`region_code\`,
        DROP COLUMN \`country_code\`
    `);
  }
}
