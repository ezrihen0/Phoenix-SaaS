import { MigrationInterface, QueryRunner } from "typeorm";

export class TechnicianCustomerFacingIdentity1796200000000 implements MigrationInterface {
  name = "TechnicianCustomerFacingIdentity1796200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`technicians\`
      ADD COLUMN \`customer_facing_name\` varchar(80) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`technicians\`
      ADD COLUMN \`customer_facing_title\` varchar(80) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`technicians\`
      ADD COLUMN \`customer_facing_photo_url\` varchar(1024) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`technicians\` DROP COLUMN \`customer_facing_photo_url\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`technicians\` DROP COLUMN \`customer_facing_title\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`technicians\` DROP COLUMN \`customer_facing_name\`
    `);
  }
}
