import type { MigrationInterface, QueryRunner } from "typeorm";

const AMBER_FLOW_ID = "amber_schedule_availability_intake";

export class VoiceFlowCatalogPhase15b1778820000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasVoiceFlows = await queryRunner.hasTable("voice_flows");
    if (!hasVoiceFlows) {
      await queryRunner.query(`
        CREATE TABLE \`voice_flows\` (
          \`id\` char(36) NOT NULL,
          \`flow_id\` varchar(64) NOT NULL,
          \`telnyx_assistant_id\` varchar(255) NULL,
          \`title\` varchar(255) NOT NULL,
          \`is_active\` tinyint NOT NULL DEFAULT 1,
          \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`ux_voice_flows_flow_id\` (\`flow_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    const amberId = "a0000001-0001-4000-8000-000000000001";
    await queryRunner.query(
      `
        INSERT INTO \`voice_flows\` (\`id\`, \`flow_id\`, \`telnyx_assistant_id\`, \`title\`, \`is_active\`)
        VALUES (?, ?, NULL, ?, 1)
        ON DUPLICATE KEY UPDATE
          \`title\` = VALUES(\`title\`),
          \`is_active\` = VALUES(\`is_active\`)
      `,
      [amberId, AMBER_FLOW_ID, "Amber — Schedule / Availability Intake"],
    );

    // Must match `voice_flows.id` charset/collation. Baseline `owned_phone_numbers` has no explicit
    // COLLATE (often utf8mb4_0900_ai_ci on MySQL 8); `voice_flows` uses utf8mb4_unicode_ci — mixed
    // collations cause ER_FK_INCOMPATIBLE_COLUMNS on foreign keys (MySQL 8.0.16+).
    const voiceFlowCol = await queryRunner.query(
      `
        SELECT COLLATION_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'owned_phone_numbers'
          AND COLUMN_NAME = 'voice_flow_id'
        LIMIT 1
      `,
    ) as Array<{ COLLATION_NAME: string | null }>;

    if (voiceFlowCol.length === 0) {
      await queryRunner.query(`
        ALTER TABLE \`owned_phone_numbers\`
        ADD COLUMN \`voice_flow_id\` char(36)
          CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
          NULL
          AFTER \`company_id\`
      `);
    } else if ((voiceFlowCol[0]?.COLLATION_NAME ?? "") !== "utf8mb4_unicode_ci") {
      await queryRunner.query(`
        ALTER TABLE \`owned_phone_numbers\`
        MODIFY COLUMN \`voice_flow_id\` char(36)
          CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
          NULL
      `);
    }

    const fkRows = await queryRunner.query(
      `
        SELECT CONSTRAINT_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'owned_phone_numbers'
          AND CONSTRAINT_TYPE = 'FOREIGN KEY'
          AND CONSTRAINT_NAME = 'FK_owned_phone_numbers_voice_flow'
        LIMIT 1
      `,
    ) as Array<{ CONSTRAINT_NAME: string }>;

    if (fkRows.length === 0) {
      await queryRunner.query(`
        ALTER TABLE \`owned_phone_numbers\`
        ADD CONSTRAINT \`FK_owned_phone_numbers_voice_flow\`
        FOREIGN KEY (\`voice_flow_id\`) REFERENCES \`voice_flows\`(\`id\`)
        ON DELETE SET NULL ON UPDATE NO ACTION
      `);
    }

    const idxRows = await queryRunner.query(
      `
        SELECT 1 AS ok
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'owned_phone_numbers'
          AND INDEX_NAME = 'ix_owned_phone_numbers_voice_flow_id'
        LIMIT 1
      `,
    ) as Array<{ ok: number }>;

    if (idxRows.length === 0) {
      await queryRunner.query(`
        CREATE INDEX \`ix_owned_phone_numbers_voice_flow_id\` ON \`owned_phone_numbers\` (\`voice_flow_id\`)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE `owned_phone_numbers` DROP FOREIGN KEY `FK_owned_phone_numbers_voice_flow`");
    await queryRunner.query("DROP INDEX `ix_owned_phone_numbers_voice_flow_id` ON `owned_phone_numbers`");
    await queryRunner.query("ALTER TABLE `owned_phone_numbers` DROP COLUMN `voice_flow_id`");
    await queryRunner.query("DROP TABLE `voice_flows`");
  }
}
