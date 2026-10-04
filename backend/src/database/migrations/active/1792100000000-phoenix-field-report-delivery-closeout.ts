import { MigrationInterface, QueryRunner } from "typeorm";

export class PhoenixFieldReportDeliveryCloseout1792100000000 implements MigrationInterface {
  name = "PhoenixFieldReportDeliveryCloseout1792100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`phoenix_field_historical_report_batches\`
      ADD COLUMN \`email_provider_accepted_at\` datetime(6) NULL AFTER \`email_sent_at\`,
      ADD COLUMN \`email_delivery_verified_at\` datetime(6) NULL AFTER \`email_provider_accepted_at\`,
      ADD COLUMN \`email_delivery_verified_by_auth_user_id\` varchar(36) NULL AFTER \`email_delivery_verified_at\`
    `);

    await queryRunner.query(`
      UPDATE \`phoenix_field_historical_report_batches\`
      SET \`email_provider_accepted_at\` = \`email_sent_at\`
      WHERE \`email_sent_at\` IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE \`phoenix_field_historical_report_org_locks\` (
        \`organization_id\` varchar(36) NOT NULL,
        \`owner_closed_at\` datetime(6) NOT NULL,
        \`owner_closed_by_auth_user_id\` varchar(36) NOT NULL,
        \`closing_batch_id\` varchar(36) NULL,
        PRIMARY KEY (\`organization_id\`),
        CONSTRAINT \`FK_pfr_org_locks_organization\`
          FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS `phoenix_field_historical_report_org_locks`");
    await queryRunner.query(`
      ALTER TABLE \`phoenix_field_historical_report_batches\`
      DROP COLUMN \`email_delivery_verified_by_auth_user_id\`,
      DROP COLUMN \`email_delivery_verified_at\`,
      DROP COLUMN \`email_provider_accepted_at\`
    `);
  }
}
