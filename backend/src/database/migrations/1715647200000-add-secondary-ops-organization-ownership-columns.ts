import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex } from "typeorm";

const secondaryOpsTables = [
  "services",
  "technicians",
  "job_notes",
  "job_status_events",
  "inspections",
  "inspection_items",
  "inspection_photos",
  "inspection_required_fields",
] as const;

export class AddSecondaryOpsOrganizationOwnershipColumns1715647200000 implements MigrationInterface {
  name = "AddSecondaryOpsOrganizationOwnershipColumns1715647200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of secondaryOpsTables) {
      await queryRunner.addColumn(
        tableName,
        new TableColumn({
          name: "organization_id",
          type: "varchar",
          length: "36",
          isNullable: true,
        }),
      );

      await queryRunner.createIndex(
        tableName,
        new TableIndex({
          name: `ix_${tableName}_organization_id`,
          columnNames: ["organization_id"],
        }),
      );

      await queryRunner.createForeignKey(
        tableName,
        new TableForeignKey({
          name: `fk_${tableName}_organization_id`,
          columnNames: ["organization_id"],
          referencedTableName: "organizations",
          referencedColumnNames: ["id"],
          onDelete: "SET NULL",
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of [...secondaryOpsTables].reverse()) {
      await queryRunner.dropForeignKey(tableName, `fk_${tableName}_organization_id`);
      await queryRunner.dropIndex(tableName, `ix_${tableName}_organization_id`);
      await queryRunner.dropColumn(tableName, "organization_id");
    }
  }
}
