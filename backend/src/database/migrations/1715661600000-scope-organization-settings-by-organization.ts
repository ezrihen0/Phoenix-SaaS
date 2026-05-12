import { MigrationInterface, QueryRunner } from "typeorm";

export class ScopeOrganizationSettingsByOrganization1715661600000 implements MigrationInterface {
  name = "ScopeOrganizationSettingsByOrganization1715661600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE organization_settings
      SET settings_key = CONCAT(organization_id, ':default')
      WHERE settings_key = 'default'
        AND organization_id IS NOT NULL
    `);
  }

  public async down(): Promise<void> {
    throw new Error("ScopeOrganizationSettingsByOrganization1715661600000 is intentionally irreversible.");
  }
}
