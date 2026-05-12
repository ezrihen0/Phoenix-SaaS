import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex } from "typeorm";

const coreOwnershipTables = [
  "customers",
  "leads",
  "jobs",
  "quotes",
  "invoices",
  "invoice_payments",
] as const;

export class AddCoreOrganizationOwnershipColumns1715643600000 implements MigrationInterface {
  name = "AddCoreOrganizationOwnershipColumns1715643600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of coreOwnershipTables) {
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
    for (const tableName of [...coreOwnershipTables].reverse()) {
      await queryRunner.dropForeignKey(tableName, `fk_${tableName}_organization_id`);
      await queryRunner.dropIndex(tableName, `ix_${tableName}_organization_id`);
      await queryRunner.dropColumn(tableName, "organization_id");
    }
  }
}
