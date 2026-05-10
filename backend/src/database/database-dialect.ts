export type SupportedDatabaseType = "mysql" | "postgres";

type DatabaseDefaults = {
  port: string;
  username: string;
  password: string;
};

const MYSQL_DEFAULTS: DatabaseDefaults = {
  port: "3306",
  username: "phoenix",
  password: "phoenix",
};

const POSTGRES_DEFAULTS: DatabaseDefaults = {
  port: "5432",
  username: "postgres",
  password: "postgres",
};

export function resolveDatabaseType(value: string | undefined): SupportedDatabaseType {
  return value?.trim().toLowerCase() === "postgres" ? "postgres" : "mysql";
}

export function getDatabaseDefaults(databaseType: SupportedDatabaseType): DatabaseDefaults {
  return databaseType === "postgres" ? POSTGRES_DEFAULTS : MYSQL_DEFAULTS;
}

export const runtimeDatabaseType = resolveDatabaseType(process.env.DB_TYPE);
export const runtimeTimestampColumnType = runtimeDatabaseType === "postgres" ? "timestamptz" : "datetime";
export const runtimeJsonColumnType = runtimeDatabaseType === "postgres" ? "jsonb" : "json";
