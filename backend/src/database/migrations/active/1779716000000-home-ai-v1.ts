import { MigrationInterface, QueryRunner } from "typeorm";

export class HomeAiV11779716000000 implements MigrationInterface {
  name = "HomeAiV11779716000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`home_ai_conversations\` (
        \`id\` varchar(36) NOT NULL,
        \`user_id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`ux_home_ai_conversations_user_org\` (\`user_id\`, \`organization_id\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_home_ai_conversations_user\`
          FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_home_ai_conversations_organization\`
          FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`home_ai_messages\` (
        \`id\` varchar(36) NOT NULL,
        \`conversation_id\` varchar(36) NOT NULL,
        \`role\` varchar(16) NOT NULL,
        \`content\` text NOT NULL,
        \`run_id\` varchar(36) NULL,
        \`record_links\` json NULL,
        \`tool_metadata\` json NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`IDX_home_ai_messages_conversation_created\` (\`conversation_id\`, \`created_at\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_home_ai_messages_conversation\`
          FOREIGN KEY (\`conversation_id\`) REFERENCES \`home_ai_conversations\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS `home_ai_messages`");
    await queryRunner.query("DROP TABLE IF EXISTS `home_ai_conversations`");
  }
}
