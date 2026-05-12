import "dotenv/config";
import "reflect-metadata";

import { DataSource } from "typeorm";

import { buildDataSourceOptions } from "./typeorm.config";
import {
  requiredColumns,
  requiredForeignKeys,
  requiredIndexes,
  requiredTables,
} from "./schema-manifest";

type IndexRow = {
  TABLE_NAME: string;
  INDEX_NAME: string;
  COLUMN_NAME: string;
  NON_UNIQUE: number;
  SEQ_IN_INDEX: number;
};

type ForeignKeyRow = {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  REFERENCED_TABLE_NAME: string;
  REFERENCED_COLUMN_NAME: string;
};

function normalizeColumns(columns: readonly string[]) {
  return columns.join("|");
}

function buildSchemaDataSource() {
  const options = buildDataSourceOptions();

  if (options.type !== "mysql") {
    throw new Error("Schema verification currently supports MySQL only.");
  }

  return new DataSource({
    ...options,
    synchronize: false,
    migrationsRun: false,
    logging: false,
  });
}

export async function verifyDatabaseSchema(dataSource: DataSource) {
  const tableRows = await dataSource.query(
    `
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
    `,
  ) as Array<{ TABLE_NAME?: string }>;

  const existingTables = new Set(
    tableRows
      .map((row) => row.TABLE_NAME)
      .filter((tableName): tableName is string => typeof tableName === "string" && tableName.length > 0),
  );

  const columnRows = await dataSource.query(
    `
      SELECT TABLE_NAME, COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
    `,
  ) as Array<{ TABLE_NAME?: string; COLUMN_NAME?: string }>;

  const columnsByTable = new Map<string, Set<string>>();
  for (const row of columnRows) {
    const tableName = row.TABLE_NAME;
    const columnName = row.COLUMN_NAME;
    if (!tableName || !columnName) {
      continue;
    }

    const existing = columnsByTable.get(tableName) ?? new Set<string>();
    existing.add(columnName);
    columnsByTable.set(tableName, existing);
  }

  const indexRows = await dataSource.query(
    `
      SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, NON_UNIQUE, SEQ_IN_INDEX
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
    `,
  ) as IndexRow[];

  const indexesByTable = new Map<string, Array<{ columns: string[]; isUnique: boolean }>>();
  const indexGroups = new Map<string, { tableName: string; indexName: string; columns: string[]; isUnique: boolean }>();

  for (const row of indexRows) {
    const key = `${row.TABLE_NAME}:${row.INDEX_NAME}`;
    const existing = indexGroups.get(key) ?? {
      tableName: row.TABLE_NAME,
      indexName: row.INDEX_NAME,
      columns: [],
      isUnique: row.NON_UNIQUE === 0,
    };
    existing.columns.push(row.COLUMN_NAME);
    indexGroups.set(key, existing);
  }

  for (const group of indexGroups.values()) {
    const existing = indexesByTable.get(group.tableName) ?? [];
    existing.push({ columns: group.columns, isUnique: group.isUnique });
    indexesByTable.set(group.tableName, existing);
  }

  const foreignKeyRows = await dataSource.query(
    `
      SELECT
        kcu.TABLE_NAME,
        kcu.COLUMN_NAME,
        kcu.REFERENCED_TABLE_NAME,
        kcu.REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE kcu
      WHERE kcu.TABLE_SCHEMA = DATABASE()
        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
    `,
  ) as ForeignKeyRow[];

  const foreignKeySet = new Set(
    foreignKeyRows.map((row) =>
      `${row.TABLE_NAME}.${row.COLUMN_NAME}->${row.REFERENCED_TABLE_NAME}.${row.REFERENCED_COLUMN_NAME}`),
  );

  const errors: string[] = [];

  for (const tableName of requiredTables) {
    if (!existingTables.has(tableName)) {
      errors.push(`Missing required table: ${tableName}`);
    }
  }

  for (const requirement of requiredColumns) {
    const existingColumns = columnsByTable.get(requirement.table) ?? new Set<string>();
    for (const columnName of requirement.columns) {
      if (!existingColumns.has(columnName)) {
        errors.push(`Missing required column: ${requirement.table}.${columnName}`);
      }
    }
  }

  for (const requirement of requiredIndexes) {
    const indexDefinitions = indexesByTable.get(requirement.table) ?? [];
    const wantedColumns = normalizeColumns(requirement.columns);
    const match = indexDefinitions.some((indexDefinition) =>
      indexDefinition.isUnique === requirement.isUnique
      && normalizeColumns(indexDefinition.columns) === wantedColumns);

    if (!match) {
      errors.push(
        `Missing required ${requirement.isUnique ? "unique " : ""}index on ${requirement.table} (${requirement.columns.join(", ")})`,
      );
    }
  }

  for (const requirement of requiredForeignKeys) {
    const key = `${requirement.table}.${requirement.column}->${requirement.referencedTable}.${requirement.referencedColumn}`;
    if (!foreignKeySet.has(key)) {
      errors.push(`Missing required foreign key: ${key}`);
    }
  }

  const migrationRows = await dataSource.query("SELECT COUNT(*) AS total FROM `typeorm_migrations`") as Array<{ total?: number }>;
  const migrationCount = Number(migrationRows[0]?.total ?? 0);
  if (!Number.isFinite(migrationCount) || migrationCount < 2) {
    errors.push("Migration ledger is incomplete: expected at least the baseline and runtime consolidation migrations.");
  }

  if (errors.length > 0) {
    throw new Error(`Schema verification failed:\n- ${errors.join("\n- ")}`);
  }
}

async function main() {
  const dataSource = buildSchemaDataSource();

  try {
    await dataSource.initialize();
    await verifyDatabaseSchema(dataSource);
    console.log(`Schema verification passed for database '${dataSource.options.database}'.`);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
