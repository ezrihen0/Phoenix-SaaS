import { MigrationInterface, QueryRunner } from "typeorm";

export class WebPushSubscriptions1795000000000 implements MigrationInterface {
  name = "WebPushSubscriptions1795000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`web_push_subscriptions\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`auth_user_id\` varchar(36) NOT NULL,
        \`endpoint\` varchar(768) NOT NULL,
        \`p256dh\` varchar(255) NOT NULL,
        \`auth\` varchar(255) NOT NULL,
        \`user_agent\` varchar(512) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`last_success_at\` datetime(6) NULL,
        \`disabled_at\` datetime(6) NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_web_push_subscriptions_endpoint\` (\`endpoint\`),
        INDEX \`IDX_web_push_subscriptions_org_user\` (\`organization_id\`, \`auth_user_id\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`web_push_subscriptions\``);
  }
}
