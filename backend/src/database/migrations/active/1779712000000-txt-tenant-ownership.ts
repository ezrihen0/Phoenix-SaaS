import { MigrationInterface, QueryRunner } from "typeorm";

export class TxtTenantOwnership1779712000000 implements MigrationInterface {
  name = "TxtTenantOwnership1779712000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE `txt_conversations` ADD COLUMN `organization_id` char(36) NULL AFTER `id`");
    await queryRunner.query("ALTER TABLE `txt_messages` ADD COLUMN `organization_id` char(36) NULL AFTER `id`");

    await queryRunner.query(`
      UPDATE \`txt_conversations\` c
      INNER JOIN \`owned_phone_numbers\` n ON n.id = c.owned_phone_number_id
      SET c.organization_id = n.tenant_id
      WHERE c.organization_id IS NULL
        AND n.tenant_id IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE \`txt_conversations\` c
      INNER JOIN \`customers\` customer ON customer.id = c.customer_id
      SET c.organization_id = customer.organization_id
      WHERE c.organization_id IS NULL
        AND customer.organization_id IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE \`txt_messages\` m
      INNER JOIN \`txt_conversations\` c ON c.id = m.conversation_id
      SET m.organization_id = c.organization_id
      WHERE m.organization_id IS NULL
        AND c.organization_id IS NOT NULL
    `);

    await queryRunner.query("DROP INDEX `ux_txt_conversations_active_pair` ON `txt_conversations`");
    await queryRunner.query("DROP INDEX `ix_txt_conversations_customer_phone_lookup` ON `txt_conversations`");

    await queryRunner.query(`
      CREATE INDEX \`ix_txt_conversations_organization\`
      ON \`txt_conversations\` (\`organization_id\`)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX \`ux_txt_conversations_active_pair\`
      ON \`txt_conversations\` (\`organization_id\`, \`owned_phone_number_normalized\`, \`customer_phone_number_normalized\`, \`is_archived\`)
    `);
    await queryRunner.query(`
      CREATE INDEX \`ix_txt_conversations_customer_phone_lookup\`
      ON \`txt_conversations\` (\`organization_id\`, \`customer_phone_number_normalized\`, \`is_archived\`)
    `);
    await queryRunner.query(`
      CREATE INDEX \`ix_txt_messages_organization\`
      ON \`txt_messages\` (\`organization_id\`)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX \`ux_txt_messages_provider_message\`
      ON \`txt_messages\` (\`provider\`, \`provider_message_id\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP INDEX `ux_txt_messages_provider_message` ON `txt_messages`");
    await queryRunner.query("DROP INDEX `ix_txt_messages_organization` ON `txt_messages`");
    await queryRunner.query("DROP INDEX `ix_txt_conversations_customer_phone_lookup` ON `txt_conversations`");
    await queryRunner.query("DROP INDEX `ux_txt_conversations_active_pair` ON `txt_conversations`");
    await queryRunner.query("DROP INDEX `ix_txt_conversations_organization` ON `txt_conversations`");

    await queryRunner.query(`
      CREATE INDEX \`ix_txt_conversations_customer_phone_lookup\`
      ON \`txt_conversations\` (\`customer_phone_number_normalized\`, \`is_archived\`)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX \`ux_txt_conversations_active_pair\`
      ON \`txt_conversations\` (\`owned_phone_number_normalized\`, \`customer_phone_number_normalized\`, \`is_archived\`)
    `);

    await queryRunner.query("ALTER TABLE `txt_messages` DROP COLUMN `organization_id`");
    await queryRunner.query("ALTER TABLE `txt_conversations` DROP COLUMN `organization_id`");
  }
}
