import type { MigrationInterface, QueryRunner } from "typeorm";

export class InvoiceServiceIntelligence1783000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`invoice_service_intelligence\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`invoice_id\` varchar(36) NOT NULL,
        \`taxonomy_version\` varchar(16) NOT NULL DEFAULT 'V1',
        \`workiz_invoice_code\` varchar(32) NULL,
        \`system_json\` json NOT NULL,
        \`system_bucket\` varchar(16) NOT NULL,
        \`primary_service_json\` json NOT NULL,
        \`service_detail_json\` json NOT NULL,
        \`labor_charged\` tinyint(1) NOT NULL,
        \`labor_raw_wording_json\` json NOT NULL,
        \`classification_confidence\` varchar(8) NOT NULL,
        \`review_reasons_json\` json NOT NULL,
        \`findings_json\` json NOT NULL,
        \`source_kind\` varchar(32) NOT NULL DEFAULT 'classification_v1',
        \`classified_at\` datetime(6) NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`UX_invoice_service_intelligence_org_invoice_taxonomy\` (\`organization_id\`, \`invoice_id\`, \`taxonomy_version\`),
        INDEX \`IDX_invoice_service_intelligence_org_taxonomy_confidence\` (\`organization_id\`, \`taxonomy_version\`, \`classification_confidence\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      ALTER TABLE \`invoice_service_intelligence\`
      ADD CONSTRAINT \`FK_isi_organization\`
      FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE \`invoice_service_intelligence\`
      ADD CONSTRAINT \`FK_isi_invoice\`
      FOREIGN KEY (\`invoice_id\`) REFERENCES \`invoices\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE \`invoice_service_intelligence_component\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`service_intelligence_id\` varchar(36) NOT NULL,
        \`invoice_id\` varchar(36) NOT NULL,
        \`canonical_component\` varchar(64) NOT NULL,
        \`raw_name\` varchar(255) NOT NULL,
        \`manufacturer_name\` varchar(128) NULL,
        \`model_or_part_number\` varchar(128) NULL,
        \`work_action\` varchar(16) NOT NULL,
        \`confidence\` varchar(8) NOT NULL,
        \`warranty_status\` varchar(32) NOT NULL,
        \`warranty_duration_months\` int NULL,
        \`warranty_source_text\` varchar(255) NULL,
        \`warranty_start_date\` date NULL,
        \`warranty_expiry_date\` date NULL,
        \`extended_warranty_months\` int NULL,
        \`extended_warranty_source_text\` varchar(255) NULL,
        \`extended_warranty_relationship\` varchar(16) NULL,
        \`extended_effective_expiry\` date NULL,
        \`evidence_json\` json NOT NULL,
        \`inventory_item_id\` varchar(36) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_isi_component_org_intelligence\` (\`organization_id\`, \`service_intelligence_id\`),
        INDEX \`IDX_isi_component_org_canonical\` (\`organization_id\`, \`canonical_component\`),
        INDEX \`IDX_isi_component_org_inventory\` (\`organization_id\`, \`inventory_item_id\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      ALTER TABLE \`invoice_service_intelligence_component\`
      ADD CONSTRAINT \`FK_isi_component_organization\`
      FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE \`invoice_service_intelligence_component\`
      ADD CONSTRAINT \`FK_isi_component_intelligence\`
      FOREIGN KEY (\`service_intelligence_id\`) REFERENCES \`invoice_service_intelligence\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE \`invoice_service_intelligence_component\`
      ADD CONSTRAINT \`FK_isi_component_invoice\`
      FOREIGN KEY (\`invoice_id\`) REFERENCES \`invoices\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE \`invoice_service_intelligence_component\`
      ADD CONSTRAINT \`FK_isi_component_inventory_item\`
      FOREIGN KEY (\`inventory_item_id\`) REFERENCES \`inventory_items\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE \`invoice_service_intelligence_warranty\` (
        \`id\` varchar(36) NOT NULL,
        \`organization_id\` varchar(36) NOT NULL,
        \`service_intelligence_id\` varchar(36) NOT NULL,
        \`invoice_id\` varchar(36) NOT NULL,
        \`scope\` varchar(24) NOT NULL,
        \`canonical_component\` varchar(64) NULL,
        \`warranty_status\` varchar(32) NOT NULL,
        \`duration_months\` int NULL,
        \`start_date\` date NULL,
        \`expiry_date\` date NULL,
        \`source_text\` varchar(255) NULL,
        \`confidence\` varchar(8) NOT NULL,
        \`evidence_json\` json NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_isi_warranty_org_intelligence\` (\`organization_id\`, \`service_intelligence_id\`),
        INDEX \`IDX_isi_warranty_org_scope\` (\`organization_id\`, \`scope\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      ALTER TABLE \`invoice_service_intelligence_warranty\`
      ADD CONSTRAINT \`FK_isi_warranty_organization\`
      FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE \`invoice_service_intelligence_warranty\`
      ADD CONSTRAINT \`FK_isi_warranty_intelligence\`
      FOREIGN KEY (\`service_intelligence_id\`) REFERENCES \`invoice_service_intelligence\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE \`invoice_service_intelligence_warranty\`
      ADD CONSTRAINT \`FK_isi_warranty_invoice\`
      FOREIGN KEY (\`invoice_id\`) REFERENCES \`invoices\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE `invoice_service_intelligence_warranty` DROP FOREIGN KEY `FK_isi_warranty_invoice`");
    await queryRunner.query("ALTER TABLE `invoice_service_intelligence_warranty` DROP FOREIGN KEY `FK_isi_warranty_intelligence`");
    await queryRunner.query("ALTER TABLE `invoice_service_intelligence_warranty` DROP FOREIGN KEY `FK_isi_warranty_organization`");
    await queryRunner.query("DROP TABLE `invoice_service_intelligence_warranty`");

    await queryRunner.query("ALTER TABLE `invoice_service_intelligence_component` DROP FOREIGN KEY `FK_isi_component_inventory_item`");
    await queryRunner.query("ALTER TABLE `invoice_service_intelligence_component` DROP FOREIGN KEY `FK_isi_component_invoice`");
    await queryRunner.query("ALTER TABLE `invoice_service_intelligence_component` DROP FOREIGN KEY `FK_isi_component_intelligence`");
    await queryRunner.query("ALTER TABLE `invoice_service_intelligence_component` DROP FOREIGN KEY `FK_isi_component_organization`");
    await queryRunner.query("DROP TABLE `invoice_service_intelligence_component`");

    await queryRunner.query("ALTER TABLE `invoice_service_intelligence` DROP FOREIGN KEY `FK_isi_invoice`");
    await queryRunner.query("ALTER TABLE `invoice_service_intelligence` DROP FOREIGN KEY `FK_isi_organization`");
    await queryRunner.query("DROP TABLE `invoice_service_intelligence`");
  }
}
