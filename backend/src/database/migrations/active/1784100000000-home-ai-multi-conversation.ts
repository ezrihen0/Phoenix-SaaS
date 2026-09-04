import { MigrationInterface, QueryRunner } from "typeorm";

import { generateHomeAiConversationTitle } from "../../../ai/home-ai-conversation-title";

export class HomeAiMultiConversation1784100000000 implements MigrationInterface {
  name = "HomeAiMultiConversation1784100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`home_ai_conversations\`
        ADD COLUMN \`title\` varchar(80) NOT NULL DEFAULT 'New conversation',
        ADD COLUMN \`last_message_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    `);

    await queryRunner.query(`
      UPDATE \`home_ai_conversations\` \`c\`
      SET \`c\`.\`last_message_at\` = COALESCE((
        SELECT MAX(\`m\`.\`created_at\`)
        FROM \`home_ai_messages\` \`m\`
        WHERE \`m\`.\`conversation_id\` = \`c\`.\`id\`
      ), \`c\`.\`updated_at\`)
    `);

    const rows = await queryRunner.query(`
      SELECT
        \`c\`.\`id\` AS \`id\`,
        \`m\`.\`content\` AS \`content\`
      FROM \`home_ai_conversations\` \`c\`
      LEFT JOIN \`home_ai_messages\` \`m\`
        ON \`m\`.\`id\` = (
          SELECT \`m2\`.\`id\`
          FROM \`home_ai_messages\` \`m2\`
          WHERE \`m2\`.\`conversation_id\` = \`c\`.\`id\`
            AND \`m2\`.\`role\` = 'user'
          ORDER BY \`m2\`.\`created_at\` ASC
          LIMIT 1
        )
    `) as Array<{ id: string; content: string | null }>;

    for (const row of rows) {
      const title = generateHomeAiConversationTitle(row.content);
      await queryRunner.query(
        "UPDATE `home_ai_conversations` SET `title` = ? WHERE `id` = ?",
        [title, row.id],
      );
    }

    await queryRunner.query(`
      CREATE INDEX \`IDX_home_ai_conversations_user_org_last_message\`
        ON \`home_ai_conversations\` (\`user_id\`, \`organization_id\`, \`last_message_at\`)
    `);

    await queryRunner.query(`
      DROP INDEX \`ux_home_ai_conversations_user_org\` ON \`home_ai_conversations\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const duplicates = await queryRunner.query(`
      SELECT \`user_id\`, \`organization_id\`, COUNT(*) AS \`total\`
      FROM \`home_ai_conversations\`
      GROUP BY \`user_id\`, \`organization_id\`
      HAVING COUNT(*) > 1
    `) as Array<{ total: number }>;

    if (duplicates.length === 0) {
      await queryRunner.query(`
        CREATE UNIQUE INDEX \`ux_home_ai_conversations_user_org\`
          ON \`home_ai_conversations\` (\`user_id\`, \`organization_id\`)
      `);
    }

    await queryRunner.query(`
      DROP INDEX \`IDX_home_ai_conversations_user_org_last_message\` ON \`home_ai_conversations\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`home_ai_conversations\`
        DROP COLUMN \`title\`,
        DROP COLUMN \`last_message_at\`
    `);
  }
}
