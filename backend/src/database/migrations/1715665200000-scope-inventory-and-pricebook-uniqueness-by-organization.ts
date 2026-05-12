import { MigrationInterface, QueryRunner, TableIndex } from "typeorm";

type ScopedUniqueTarget = {
  tableName: string;
  valueColumn: string;
  scopedIndexName: string;
};

const scopedUniqueTargets: ScopedUniqueTarget[] = [
  {
    tableName: "inventory_items",
    valueColumn: "internal_sku",
    scopedIndexName: "ux_inventory_items_org_sku",
  },
  {
    tableName: "inventory_locations",
    valueColumn: "name",
    scopedIndexName: "ux_inventory_locations_org_name",
  },
  {
    tableName: "pricebook_items",
    valueColumn: "internal_sku",
    scopedIndexName: "ux_pricebook_items_org_sku",
  },
];

export class ScopeInventoryAndPricebookUniquenessByOrganization1715665200000 implements MigrationInterface {
  name = "ScopeInventoryAndPricebookUniquenessByOrganization1715665200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const target of scopedUniqueTargets) {
      const table = await queryRunner.getTable(target.tableName);

      if (!table) {
        continue;
      }

      for (const unique of table.uniques) {
        if (unique.columnNames.length === 1 && unique.columnNames[0] === target.valueColumn) {
          await queryRunner.dropUniqueConstraint(table, unique);
        }
      }

      for (const index of table.indices) {
        if (
          index.isUnique
          && index.columnNames.length === 1
          && index.columnNames[0] === target.valueColumn
        ) {
          await queryRunner.dropIndex(table, index);
        }
      }

      const refreshedTable = await queryRunner.getTable(target.tableName);
      const hasScopedIndex = refreshedTable?.indices.some((index) => index.name === target.scopedIndexName);

      if (!hasScopedIndex) {
        await queryRunner.createIndex(
          target.tableName,
          new TableIndex({
            name: target.scopedIndexName,
            columnNames: ["organization_id", target.valueColumn],
            isUnique: true,
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const target of [...scopedUniqueTargets].reverse()) {
      const table = await queryRunner.getTable(target.tableName);

      if (!table) {
        continue;
      }

      const scopedIndex = table.indices.find((index) => index.name === target.scopedIndexName);

      if (scopedIndex) {
        await queryRunner.dropIndex(table, scopedIndex);
      }
    }
  }
}
