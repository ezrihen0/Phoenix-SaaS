import { MigrationInterface, QueryRunner } from "typeorm";

export class PortalIdentities1796000000000 implements MigrationInterface {
  name = "PortalIdentities1796000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`portal_identities\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`customer_id\` varchar(36) NOT NULL,
        \`status\` enum('ready', 'email_required', 'manual_review') NOT NULL DEFAULT 'email_required',
        \`primary_email_normalized\` varchar(320) NULL,
        \`last_evaluated_at\` datetime(6) NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`UQ_portal_identities_customer_id\` (\`customer_id\`),
        INDEX \`IDX_portal_identities_org_email\` (\`organization_id\`, \`primary_email_normalized\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      ALTER TABLE \`portal_identities\`
      ADD CONSTRAINT \`FK_portal_identities_customer\`
      FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE \`portal_identities\`
      ADD CONSTRAINT \`FK_portal_identities_organization\`
      FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE \`portal_email_otp_challenges\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`portal_identity_id\` varchar(36) NOT NULL,
        \`email_normalized\` varchar(320) NOT NULL,
        \`code_hash\` varchar(128) NOT NULL,
        \`expires_at\` datetime(6) NOT NULL,
        \`send_attempt_bucket\` varchar(64) NOT NULL,
        \`verify_attempt_count\` int NOT NULL DEFAULT 0,
        \`consumed_at\` datetime(6) NULL,
        \`client_ip_hash\` varchar(64) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`IDX_portal_otp_identity_created\` (\`portal_identity_id\`, \`created_at\`),
        INDEX \`IDX_portal_otp_org_email_bucket\` (\`organization_id\`, \`email_normalized\`, \`send_attempt_bucket\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      ALTER TABLE \`portal_email_otp_challenges\`
      ADD CONSTRAINT \`FK_portal_otp_identity\`
      FOREIGN KEY (\`portal_identity_id\`) REFERENCES \`portal_identities\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE \`portal_email_otp_challenges\`
      ADD CONSTRAINT \`FK_portal_otp_organization\`
      FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE \`portal_sessions\`
      ADD \`portal_identity_id\` varchar(36) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`portal_sessions\`
      ADD CONSTRAINT \`FK_portal_sessions_identity\`
      FOREIGN KEY (\`portal_identity_id\`) REFERENCES \`portal_identities\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`portal_sessions\` DROP FOREIGN KEY \`FK_portal_sessions_identity\``);
    await queryRunner.query(`ALTER TABLE \`portal_sessions\` DROP COLUMN \`portal_identity_id\``);
    await queryRunner.query(`ALTER TABLE \`portal_email_otp_challenges\` DROP FOREIGN KEY \`FK_portal_otp_organization\``);
    await queryRunner.query(`ALTER TABLE \`portal_email_otp_challenges\` DROP FOREIGN KEY \`FK_portal_otp_identity\``);
    await queryRunner.query(`DROP TABLE \`portal_email_otp_challenges\``);
    await queryRunner.query(`ALTER TABLE \`portal_identities\` DROP FOREIGN KEY \`FK_portal_identities_organization\``);
    await queryRunner.query(`ALTER TABLE \`portal_identities\` DROP FOREIGN KEY \`FK_portal_identities_customer\``);
    await queryRunner.query(`DROP TABLE \`portal_identities\``);
  }
}
