import { MigrationInterface, QueryRunner } from "typeorm";

export class MarketingPhase4CrmIntelligence1778780000000 implements MigrationInterface {
  name = "MarketingPhase4CrmIntelligence1778780000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`marketing_opportunities\`
        ADD \`dedupe_key\` varchar(191) NULL,
        ADD \`signal_version\` int NOT NULL DEFAULT 1,
        ADD \`converted_draft_id\` varchar(36) NULL,
        ADD \`dismissed_at\` datetime(6) NULL,
        ADD \`dismissed_by_user_id\` varchar(36) NULL,
        ADD \`archived_at\` datetime(6) NULL,
        ADD \`last_refreshed_at\` datetime(6) NULL
    `);

    await queryRunner.query(`
      UPDATE \`marketing_opportunities\`
      SET \`dedupe_key\` = CONCAT('legacy:', \`id\`)
      WHERE \`dedupe_key\` IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`marketing_opportunities\`
        MODIFY \`dedupe_key\` varchar(191) NOT NULL,
        MODIFY \`status\` varchar(32) NOT NULL DEFAULT 'suggested'
    `);

    await queryRunner.query(`
      UPDATE \`marketing_opportunities\`
      SET \`status\` = 'suggested'
      WHERE \`status\` = 'detected'
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX \`ux_marketing_opportunities_org_dedupe\`
        ON \`marketing_opportunities\` (\`organization_id\`, \`dedupe_key\`)
    `);

    await queryRunner.query(`
      CREATE INDEX \`IDX_marketing_opportunities_org_status\`
        ON \`marketing_opportunities\` (\`organization_id\`, \`status\`)
    `);

    await queryRunner.query(`
      ALTER TABLE \`marketing_opportunities\`
        ADD CONSTRAINT \`FK_marketing_opportunities_converted_draft\`
        FOREIGN KEY (\`converted_draft_id\`) REFERENCES \`marketing_content_drafts\`(\`id\`)
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE \`marketing_opportunities\`
        ADD CONSTRAINT \`FK_marketing_opportunities_dismissed_by\`
        FOREIGN KEY (\`dismissed_by_user_id\`) REFERENCES \`users\`(\`id\`)
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`marketing_opportunities\` DROP FOREIGN KEY \`FK_marketing_opportunities_dismissed_by\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`marketing_opportunities\` DROP FOREIGN KEY \`FK_marketing_opportunities_converted_draft\`
    `);
    await queryRunner.query(`DROP INDEX \`IDX_marketing_opportunities_org_status\` ON \`marketing_opportunities\``);
    await queryRunner.query(`DROP INDEX \`ux_marketing_opportunities_org_dedupe\` ON \`marketing_opportunities\``);
    await queryRunner.query(`
      ALTER TABLE \`marketing_opportunities\`
        DROP COLUMN \`last_refreshed_at\`,
        DROP COLUMN \`archived_at\`,
        DROP COLUMN \`dismissed_by_user_id\`,
        DROP COLUMN \`dismissed_at\`,
        DROP COLUMN \`converted_draft_id\`,
        DROP COLUMN \`signal_version\`,
        DROP COLUMN \`dedupe_key\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`marketing_opportunities\`
        MODIFY \`status\` varchar(32) NOT NULL DEFAULT 'detected'
    `);
  }
}
