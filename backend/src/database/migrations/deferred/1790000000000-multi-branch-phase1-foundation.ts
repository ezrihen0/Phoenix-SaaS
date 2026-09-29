import { randomUUID } from "crypto";
import type { MigrationInterface, QueryRunner } from "typeorm";

const PHOENIX_ORG_SLUGS = ["phoenix", "phoenix-fireplace"] as const;

export class MultiBranchPhase1Foundation1790000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`branches\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`name\` varchar(160) NOT NULL,
        \`code\` varchar(16) NOT NULL,
        \`phone\` varchar(64) NULL,
        \`email\` varchar(320) NULL,
        \`website\` varchar(512) NULL,
        \`address_line\` varchar(255) NULL,
        \`city\` varchar(128) NULL,
        \`province\` varchar(64) NULL,
        \`postal_code\` varchar(32) NULL,
        \`logo_url\` varchar(1024) NULL,
        \`tax_label\` varchar(32) NULL,
        \`default_tax_rate_bps\` int NOT NULL DEFAULT 0,
        \`tax_number\` varchar(128) NULL,
        \`invoice_prefix\` varchar(32) NOT NULL DEFAULT '',
        \`estimate_prefix\` varchar(32) NOT NULL DEFAULT '',
        \`active\` tinyint NOT NULL DEFAULT 1,
        \`sort_order\` int NOT NULL DEFAULT 0,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`ux_branches_organization_code\` (\`organization_id\`, \`code\`),
        INDEX \`IDX_branches_organization_active_sort\` (\`organization_id\`, \`active\`, \`sort_order\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      ALTER TABLE \`branches\`
      ADD CONSTRAINT \`FK_branches_organization\`
      FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE \`membership_branch_access\` (
        \`id\` varchar(36) NOT NULL,
        \`membership_id\` varchar(36) NOT NULL,
        \`branch_id\` varchar(36) NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`ux_membership_branch_access\` (\`membership_id\`, \`branch_id\`),
        INDEX \`IDX_membership_branch_access_branch\` (\`branch_id\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      ALTER TABLE \`membership_branch_access\`
      ADD CONSTRAINT \`FK_membership_branch_access_membership\`
      FOREIGN KEY (\`membership_id\`) REFERENCES \`memberships\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE \`membership_branch_access\`
      ADD CONSTRAINT \`FK_membership_branch_access_branch\`
      FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE \`branch_invoice_sequences\` (
        \`branch_id\` varchar(36) NOT NULL,
        \`next_value\` bigint NOT NULL DEFAULT 1001,
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`branch_id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      ALTER TABLE \`branch_invoice_sequences\`
      ADD CONSTRAINT \`FK_branch_invoice_sequences_branch\`
      FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE \`jobs\`
      ADD COLUMN \`branch_id\` varchar(36) NULL,
      ADD INDEX \`IDX_jobs_organization_branch\` (\`organization_id\`, \`branch_id\`)
    `);

    await queryRunner.query(`
      ALTER TABLE \`jobs\`
      ADD CONSTRAINT \`FK_jobs_branch\`
      FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE \`quotes\`
      ADD COLUMN \`branch_id\` varchar(36) NULL,
      ADD INDEX \`IDX_quotes_organization_branch\` (\`organization_id\`, \`branch_id\`)
    `);

    await queryRunner.query(`
      ALTER TABLE \`quotes\`
      ADD CONSTRAINT \`FK_quotes_branch\`
      FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE \`invoices\`
      ADD COLUMN \`branch_id\` varchar(36) NULL,
      ADD INDEX \`IDX_invoices_organization_branch\` (\`organization_id\`, \`branch_id\`)
    `);

    await queryRunner.query(`
      ALTER TABLE \`invoices\`
      ADD CONSTRAINT \`FK_invoices_branch\`
      FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await this.seedPhoenixBranches(queryRunner);
  }

  private async seedPhoenixBranches(queryRunner: QueryRunner) {
    const slugList = PHOENIX_ORG_SLUGS.map((slug) => `'${slug}'`).join(", ");
    const organizations = (await queryRunner.query(
      `SELECT id FROM organizations WHERE slug IN (${slugList})`,
    )) as Array<{ id: string }>;

    for (const organization of organizations) {
      const abId = randomUUID();
      const onId = randomUUID();
      const now = new Date();

      await queryRunner.query(
        `
          INSERT INTO branches (
            id, organization_id, name, code, tax_label, default_tax_rate_bps,
            invoice_prefix, estimate_prefix, active, sort_order, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [abId, organization.id, "Alberta", "AB", "GST", 500, "AB-INV-", "AB-EST-", 1, 1, now, now],
      );

      await queryRunner.query(
        `
          INSERT INTO branches (
            id, organization_id, name, code, tax_label, default_tax_rate_bps,
            invoice_prefix, estimate_prefix, active, sort_order, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [onId, organization.id, "Ontario", "ON", "HST", 1300, "ON-INV-", "ON-EST-", 1, 2, now, now],
      );

      await queryRunner.query(
        `INSERT INTO branch_invoice_sequences (branch_id, next_value) VALUES (?, ?), (?, ?)`,
        [abId, "1001", onId, "1001"],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`invoices\` DROP FOREIGN KEY \`FK_invoices_branch\``);
    await queryRunner.query(`ALTER TABLE \`invoices\` DROP INDEX \`IDX_invoices_organization_branch\``);
    await queryRunner.query(`ALTER TABLE \`invoices\` DROP COLUMN \`branch_id\``);

    await queryRunner.query(`ALTER TABLE \`quotes\` DROP FOREIGN KEY \`FK_quotes_branch\``);
    await queryRunner.query(`ALTER TABLE \`quotes\` DROP INDEX \`IDX_quotes_organization_branch\``);
    await queryRunner.query(`ALTER TABLE \`quotes\` DROP COLUMN \`branch_id\``);

    await queryRunner.query(`ALTER TABLE \`jobs\` DROP FOREIGN KEY \`FK_jobs_branch\``);
    await queryRunner.query(`ALTER TABLE \`jobs\` DROP INDEX \`IDX_jobs_organization_branch\``);
    await queryRunner.query(`ALTER TABLE \`jobs\` DROP COLUMN \`branch_id\``);

    await queryRunner.query(`DROP TABLE \`branch_invoice_sequences\``);

    await queryRunner.query(`
      ALTER TABLE \`membership_branch_access\`
      DROP FOREIGN KEY \`FK_membership_branch_access_branch\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`membership_branch_access\`
      DROP FOREIGN KEY \`FK_membership_branch_access_membership\`
    `);
    await queryRunner.query(`DROP TABLE \`membership_branch_access\``);

    await queryRunner.query(`ALTER TABLE \`branches\` DROP FOREIGN KEY \`FK_branches_organization\``);
    await queryRunner.query(`DROP TABLE \`branches\``);
  }
}
