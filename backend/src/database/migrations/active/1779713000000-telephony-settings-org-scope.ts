import { MigrationInterface, QueryRunner } from "typeorm";

export class TelephonySettingsOrgScope1779713000000 implements MigrationInterface {
  name = "TelephonySettingsOrgScope1779713000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE `call_flow_configs` ADD COLUMN `organization_id` char(36) NULL AFTER `id`");
    await queryRunner.query("ALTER TABLE `missed_call_sms_settings` ADD COLUMN `organization_id` char(36) NULL AFTER `id`");
    await queryRunner.query("CREATE INDEX `ix_call_flow_configs_org_active` ON `call_flow_configs` (`organization_id`, `is_active`)");
    await queryRunner.query("CREATE INDEX `ix_missed_call_sms_settings_org` ON `missed_call_sms_settings` (`organization_id`)");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP INDEX `ix_missed_call_sms_settings_org` ON `missed_call_sms_settings`");
    await queryRunner.query("DROP INDEX `ix_call_flow_configs_org_active` ON `call_flow_configs`");
    await queryRunner.query("ALTER TABLE `missed_call_sms_settings` DROP COLUMN `organization_id`");
    await queryRunner.query("ALTER TABLE `call_flow_configs` DROP COLUMN `organization_id`");
  }
}
