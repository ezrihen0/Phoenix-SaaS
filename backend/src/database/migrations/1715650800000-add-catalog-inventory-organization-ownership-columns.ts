import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex } from "typeorm";

const catalogInventoryTables = [
  "pricebook_items",
  "pricebook_bundles",
  "pricebook_bundle_items",
  "inventory_items",
  "inventory_locations",
  "inventory_movements",
] as const;

export class AddCatalogInventoryOrganizationOwnershipColumns1715650800000 implements MigrationInterface {
  name = "AddCatalogInventoryOrganizationOwnershipColumns1715650800000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of catalogInventoryTables) {
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
    for (const tableName of [...catalogInventoryTables].reverse()) {
      await queryRunner.dropForeignKey(tableName, `fk_${tableName}_organization_id`);
      await queryRunner.dropIndex(tableName, `ix_${tableName}_organization_id`);
      await queryRunner.dropColumn(tableName, "organization_id");
    }
  }
}
