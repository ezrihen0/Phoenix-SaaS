import { MigrationInterface, QueryRunner } from "typeorm";

export class LeadDisposition1781000000000 implements MigrationInterface {
  name = "LeadDisposition1781000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`leads\`
        ADD COLUMN \`disposition\` enum('not_booked') NULL,
        ADD COLUMN \`disposition_reason\` enum(
          'price',
          'no_availability',
          'researching',
          'no_response',
          'outside_area',
          'other_company',
          'other'
        ) NULL,
        ADD COLUMN \`disposition_note\` text NULL,
        ADD COLUMN \`disposition_at\` datetime(6) NULL,
        ADD COLUMN \`disposition_by_auth_user_id\` varchar(36) NULL
    `);

    await queryRunner.query(`
      CREATE INDEX \`IDX_leads_org_disposition\`
        ON \`leads\` (\`organization_id\`, \`disposition\`)
    `);

    await queryRunner.query(`
      ALTER TABLE \`leads\`
        MODIFY COLUMN \`source\` enum(
          'phone',
          'website',
          'google',
          'facebook',
          'referral',
          'repeat_customer',
          'other'
        ) NOT NULL DEFAULT 'website'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`leads\`
        MODIFY COLUMN \`source\` enum(
          'phone',
          'website',
          'google',
          'referral',
          'repeat_customer',
          'other'
        ) NOT NULL DEFAULT 'website'
    `);

    await queryRunner.query(`
      DROP INDEX \`IDX_leads_org_disposition\` ON \`leads\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`leads\`
        DROP COLUMN \`disposition_by_auth_user_id\`,
        DROP COLUMN \`disposition_at\`,
        DROP COLUMN \`disposition_note\`,
        DROP COLUMN \`disposition_reason\`,
        DROP COLUMN \`disposition\`
    `);
  }
}
