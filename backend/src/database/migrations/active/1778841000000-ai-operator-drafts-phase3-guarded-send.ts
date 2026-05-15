import { MigrationInterface, QueryRunner } from "typeorm";

export class AiOperatorDraftsPhase3GuardedSend1778841000000 implements MigrationInterface {
  name = "AiOperatorDraftsPhase3GuardedSend1778841000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`ai_operator_drafts\`
      ADD \`outbound_txt_message_id\` varchar(36) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`ai_operator_drafts\`
      ADD CONSTRAINT \`FK_ai_operator_drafts_outbound_txt_message\`
      FOREIGN KEY (\`outbound_txt_message_id\`) REFERENCES \`txt_messages\`(\`id\`)
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`ai_operator_drafts\` DROP FOREIGN KEY \`FK_ai_operator_drafts_outbound_txt_message\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`ai_operator_drafts\` DROP COLUMN \`outbound_txt_message_id\`
    `);
  }
}
