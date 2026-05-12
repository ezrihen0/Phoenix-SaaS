import type { DataSource } from "typeorm";

export async function assertTablesExist(dataSource: DataSource, tableNames: string[]) {
  const uniqueTableNames = [...new Set(tableNames.map((tableName) => tableName.trim()).filter(Boolean))];

  if (!uniqueTableNames.length) {
    return;
  }

  const placeholders = uniqueTableNames.map(() => "?").join(", ");
  const rows = await dataSource.query(
    `
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (${placeholders})
    `,
    uniqueTableNames,
  ) as Array<{ TABLE_NAME?: string }>;

  const existingTableNames = new Set(
    rows
      .map((row) => row.TABLE_NAME)
      .filter((tableName): tableName is string => typeof tableName === "string" && tableName.length > 0),
  );

  const missingTableNames = uniqueTableNames.filter((tableName) => !existingTableNames.has(tableName));

  if (missingTableNames.length === 0) {
    return;
  }

  throw new Error(
    `Database schema is not initialized. Missing table(s): ${missingTableNames.join(", ")}. Run the official TypeORM migrations before starting the backend.`,
  );
}
