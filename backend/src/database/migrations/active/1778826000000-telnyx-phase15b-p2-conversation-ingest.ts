import type { MigrationInterface, QueryRunner } from "typeorm";

export class TelnyxPhase15bP2ConversationIngest1778826000000 implements MigrationInterface {
  name = "TelnyxPhase15bP2ConversationIngest1778826000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`recent_calls\`
        ADD COLUMN \`telnyx_conversation_id\` varchar(255) NULL,
        ADD COLUMN \`telnyx_ai_assistant_id\` varchar(255) NULL,
        ADD COLUMN \`ai_conversation_messages_json\` longtext NULL
    `);

    await queryRunner.query(`
      CREATE TABLE \`telnyx_webhook_event_receipts\` (
        \`id\` char(36) NOT NULL,
        \`provider\` varchar(64) NOT NULL DEFAULT 'telnyx',
        \`provider_event_id\` varchar(255) NOT NULL,
        \`event_type\` varchar(128) NOT NULL,
        \`recent_call_id\` char(36) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`ux_telnyx_webhook_event_receipt\` (\`provider\`, \`provider_event_id\`),
        KEY \`ix_telnyx_webhook_event_receipt_recent_call\` (\`recent_call_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS `telnyx_webhook_event_receipts`");
    await queryRunner.query(`
      ALTER TABLE \`recent_calls\`
        DROP COLUMN \`ai_conversation_messages_json\`,
        DROP COLUMN \`telnyx_ai_assistant_id\`,
        DROP COLUMN \`telnyx_conversation_id\`
    `);
  }
}
