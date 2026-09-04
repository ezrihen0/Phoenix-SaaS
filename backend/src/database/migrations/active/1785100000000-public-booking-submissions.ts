import { MigrationInterface, QueryRunner } from "typeorm";

export class PublicBookingSubmissions1785100000000 implements MigrationInterface {
  name = "PublicBookingSubmissions1785100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`public_booking_submissions\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`idempotency_key\` varchar(64) NOT NULL,
        \`lead_id\` varchar(36) NOT NULL,
        \`customer_id\` varchar(36) NULL,
        \`client_ip_hash\` varchar(64) NULL,
        \`phone_last_10\` varchar(10) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_public_booking_submissions_org_idempotency\` (\`organization_id\`, \`idempotency_key\`),
        INDEX \`IDX_public_booking_submissions_org_phone_created\` (\`organization_id\`, \`phone_last_10\`, \`created_at\`),
        INDEX \`IDX_public_booking_submissions_org_ip_created\` (\`organization_id\`, \`client_ip_hash\`, \`created_at\`),
        CONSTRAINT \`FK_public_booking_submissions_organization\`
          FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_public_booking_submissions_lead\`
          FOREIGN KEY (\`lead_id\`) REFERENCES \`leads\`(\`id\`)
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT \`FK_public_booking_submissions_customer\`
          FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\`(\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS `public_booking_submissions`");
  }
}
