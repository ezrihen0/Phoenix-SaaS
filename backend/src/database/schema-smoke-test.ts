import "dotenv/config";
import "reflect-metadata";

import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { verifyDatabaseSchema } from "./verify-schema";
import { buildDataSourceOptions } from "./typeorm.config";

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();

  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Schema smoke test currently supports MySQL only.");
  }

  return {
    ...(options as MysqlConnectionOptions),
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 3306,
    username: options.username ?? "root",
    password: options.password ?? "",
    synchronize: false,
    migrationsRun: false,
    logging: false,
  };
}

async function main() {
  const options = requireMySqlOptions();
  const databaseName = process.env.DB_SMOKE_DATABASE?.trim()
    || `wizfield_smoke_${Date.now()}`;
  const shouldDrop = (process.env.DB_SMOKE_DROP ?? "false").trim().toLowerCase() === "true";

  const adminConnection = await mysql.createConnection({
    host: options.host,
    port: options.port,
    user: options.username,
    password: options.password,
    multipleStatements: true,
  });

  let dataSource: DataSource | null = null;

  try {
    await adminConnection.query(
      `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );

    dataSource = new DataSource({
      ...options,
      database: databaseName,
    });

    await dataSource.initialize();
    await dataSource.runMigrations();
    await verifyDatabaseSchema(dataSource);

    console.log(`Schema smoke test passed for disposable database '${databaseName}'.`);
  } finally {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }

    if (shouldDrop) {
      await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    }

    await adminConnection.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
