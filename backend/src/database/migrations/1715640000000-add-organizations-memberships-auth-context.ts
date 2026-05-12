import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from "typeorm";

export class AddOrganizationsMembershipsAuthContext1715640000000 implements MigrationInterface {
  name = "AddOrganizationsMembershipsAuthContext1715640000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "organizations",
        columns: [
          {
            name: "id",
            type: "char",
            length: "36",
            isPrimary: true,
          },
          {
            name: "name",
            type: "varchar",
            length: "160",
          },
          {
            name: "slug",
            type: "varchar",
            length: "160",
            isUnique: true,
          },
          {
            name: "is_active",
            type: "boolean",
            default: queryRunner.connection.options.type === "postgres" ? "true" : "1",
          },
          {
            name: "created_at",
            type: queryRunner.connection.options.type === "postgres" ? "timestamptz" : "datetime",
            precision: 6,
            default: queryRunner.connection.options.type === "postgres" ? "CURRENT_TIMESTAMP" : "CURRENT_TIMESTAMP(6)",
          },
          {
            name: "updated_at",
            type: queryRunner.connection.options.type === "postgres" ? "timestamptz" : "datetime",
            precision: 6,
            default: queryRunner.connection.options.type === "postgres" ? "CURRENT_TIMESTAMP" : "CURRENT_TIMESTAMP(6)",
          },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: "memberships",
        columns: [
          {
            name: "id",
            type: "char",
            length: "36",
            isPrimary: true,
          },
          {
            name: "user_id",
            type: "varchar",
            length: "36",
          },
          {
            name: "organization_id",
            type: "varchar",
            length: "36",
          },
          {
            name: "role",
            type: "enum",
            enum: ["owner", "admin", "office_admin", "dispatcher", "csr", "technician", "viewer"],
          },
          {
            name: "status",
            type: "enum",
            enum: ["active", "invited", "suspended"],
            default: "'active'",
          },
          {
            name: "created_at",
            type: queryRunner.connection.options.type === "postgres" ? "timestamptz" : "datetime",
            precision: 6,
            default: queryRunner.connection.options.type === "postgres" ? "CURRENT_TIMESTAMP" : "CURRENT_TIMESTAMP(6)",
          },
          {
            name: "updated_at",
            type: queryRunner.connection.options.type === "postgres" ? "timestamptz" : "datetime",
            precision: 6,
            default: queryRunner.connection.options.type === "postgres" ? "CURRENT_TIMESTAMP" : "CURRENT_TIMESTAMP(6)",
          },
        ],
        uniques: [
          {
            name: "ux_memberships_user_organization",
            columnNames: ["user_id", "organization_id"],
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      "memberships",
      new TableIndex({
        name: "ix_memberships_user_id",
        columnNames: ["user_id"],
      }),
    );

    await queryRunner.createIndex(
      "memberships",
      new TableIndex({
        name: "ix_memberships_organization_id",
        columnNames: ["organization_id"],
      }),
    );

    await queryRunner.createForeignKeys("memberships", [
      new TableForeignKey({
        name: "fk_memberships_user_id",
        columnNames: ["user_id"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      }),
      new TableForeignKey({
        name: "fk_memberships_organization_id",
        columnNames: ["organization_id"],
        referencedTableName: "organizations",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      }),
    ]);

    await queryRunner.addColumn(
      "auth_sessions",
      new TableColumn({
        name: "active_organization_id",
        type: "varchar",
        length: "36",
        isNullable: true,
      }),
    );

    await queryRunner.createIndex(
      "auth_sessions",
      new TableIndex({
        name: "ix_auth_sessions_active_organization_id",
        columnNames: ["active_organization_id"],
      }),
    );

    await queryRunner.createForeignKey(
      "auth_sessions",
      new TableForeignKey({
        name: "fk_auth_sessions_active_organization_id",
        columnNames: ["active_organization_id"],
        referencedTableName: "organizations",
        referencedColumnNames: ["id"],
        onDelete: "SET NULL",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey("auth_sessions", "fk_auth_sessions_active_organization_id");
    await queryRunner.dropIndex("auth_sessions", "ix_auth_sessions_active_organization_id");
    await queryRunner.dropColumn("auth_sessions", "active_organization_id");

    await queryRunner.dropForeignKey("memberships", "fk_memberships_organization_id");
    await queryRunner.dropForeignKey("memberships", "fk_memberships_user_id");
    await queryRunner.dropIndex("memberships", "ix_memberships_organization_id");
    await queryRunner.dropIndex("memberships", "ix_memberships_user_id");
    await queryRunner.dropTable("memberships");
    await queryRunner.dropTable("organizations");
  }
}
