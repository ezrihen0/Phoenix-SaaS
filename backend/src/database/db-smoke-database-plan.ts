import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

export type SmokeDatabasePlan =
  | { mode: "ephemeral"; databaseName: string; shouldDrop: boolean }
  | { mode: "configured"; databaseName: string; shouldDrop: false };

export function normalizeBooleanFlag(value: string | undefined, fallback: boolean) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function useConfiguredSmokeDatabase() {
  return (
    normalizeBooleanFlag(process.env.FINANCE_SMOKE_USE_CONFIGURED_DATABASE, false)
    || normalizeBooleanFlag(process.env.DB_SMOKE_USE_CONFIGURED, false)
  );
}

export function resolveSmokeDatabasePlan(
  options: MysqlConnectionOptions,
  ephemeralNamePrefix: string,
): SmokeDatabasePlan {
  if (useConfiguredSmokeDatabase()) {
    const databaseName = typeof options.database === "string" ? options.database.trim() : "";
    if (!databaseName) {
      throw new Error(
        "FINANCE_SMOKE_USE_CONFIGURED_DATABASE requires DATABASE_URL / configured database name.",
      );
    }

    return { mode: "configured", databaseName, shouldDrop: false };
  }

  const databaseName = process.env.DB_SMOKE_DATABASE?.trim()
    || `${ephemeralNamePrefix}_${Date.now()}`;
  const shouldDrop = normalizeBooleanFlag(process.env.DB_SMOKE_DROP, false);

  return { mode: "ephemeral", databaseName, shouldDrop };
}
