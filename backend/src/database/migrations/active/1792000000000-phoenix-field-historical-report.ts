import { MigrationInterface, QueryRunner } from "typeorm";

export class PhoenixFieldHistoricalReport1792000000000 implements MigrationInterface {
  name = "PhoenixFieldHistoricalReport1792000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`phoenix_field_historical_report_batches\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`created_by_auth_user_id\` varchar(36) NOT NULL,
        \`report_recipient_email\` varchar(255) NULL,
        \`status\` enum('draft','imported','import_partial','email_pending','email_sent','email_failed') NOT NULL DEFAULT 'draft',
        \`submission_idempotency_key\` varchar(64) NULL,
        \`submitted_at\` datetime(6) NULL,
        \`submitted_by_auth_user_id\` varchar(36) NULL,
        \`email_message_id\` varchar(255) NULL,
        \`email_sent_at\` datetime(6) NULL,
        \`email_last_error\` text NULL,
        \`pdf_storage_key\` varchar(512) NULL,
        \`totals_json\` json NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_pfr_batches_submission_idempotency\` (\`submission_idempotency_key\`),
        INDEX \`IDX_pfr_batches_org_creator_status\` (\`organization_id\`, \`created_by_auth_user_id\`, \`status\`),
        CONSTRAINT \`FK_pfr_batches_organization\`
          FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`phoenix_field_historical_report_entries\` (
        \`id\` varchar(36) NOT NULL,
        \`batch_id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`client_row_key\` varchar(36) NOT NULL,
        \`sort_order\` int NOT NULL DEFAULT 0,
        \`status\` enum('draft','ready','imported','failed','duplicate_blocked') NOT NULL DEFAULT 'draft',
        \`payload_json\` json NOT NULL,
        \`customer_match_json\` json NULL,
        \`duplicate_job_json\` json NULL,
        \`customer_id\` varchar(36) NULL,
        \`job_id\` varchar(36) NULL,
        \`invoice_id\` varchar(36) NULL,
        \`payment_id\` varchar(36) NULL,
        \`entry_import_key\` varchar(128) NULL,
        \`last_error_code\` varchar(64) NULL,
        \`last_error_message\` text NULL,
        \`imported_at\` datetime(6) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_pfr_entries_import_key\` (\`entry_import_key\`),
        UNIQUE INDEX \`UQ_pfr_entries_batch_client_row\` (\`batch_id\`, \`client_row_key\`),
        INDEX \`IDX_pfr_entries_batch_status\` (\`batch_id\`, \`status\`),
        CONSTRAINT \`FK_pfr_entries_batch\`
          FOREIGN KEY (\`batch_id\`) REFERENCES \`phoenix_field_historical_report_batches\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_pfr_entries_organization\`
          FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_pfr_entries_customer\`
          FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\`(\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT \`FK_pfr_entries_job\`
          FOREIGN KEY (\`job_id\`) REFERENCES \`jobs\`(\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT \`FK_pfr_entries_invoice\`
          FOREIGN KEY (\`invoice_id\`) REFERENCES \`invoices\`(\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS `phoenix_field_historical_report_entries`");
    await queryRunner.query("DROP TABLE IF EXISTS `phoenix_field_historical_report_batches`");
  }
}
