import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

/** Legacy bootstrap id; production operating org uses SoT id below. */
export const PHOENIX_ORG_ID_LEGACY = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";
/** Phoenix Fireplace operating org on production `wizfield` (SoT). */
export const PHOENIX_ORG_ID = "8d5bc762-eb13-43e5-85a1-723477adb47c";
export const PHOENIX_ORG_SLUG = "phoenix-fireplace";

export const PHOENIX_OPERATING_ORG_IDS = [PHOENIX_ORG_ID, PHOENIX_ORG_ID_LEGACY] as const;

export const WORKIZ_ALLOW_PRODUCTION_MUTATION_ENV = "WORKIZ_ALLOW_PRODUCTION_MUTATION";
export const JOBBER_ALLOW_PRODUCTION_MUTATION_ENV = "JOBBER_ALLOW_PRODUCTION_MUTATION";

export type WorkizMutationGuardContext = {
  databaseName?: string | null;
  organizationId?: string | null;
  organizationSlug?: string | null;
  allowProductionMutation?: boolean;
  commandLabel: string;
};

export function resolveDatabaseNameFromOptions(options: { database?: unknown }): string | null {
  if (typeof options.database !== "string" || options.database.trim().length === 0) {
    return null;
  }
  return options.database;
}

export function isEphemeralWorkizMutationDatabase(databaseName: string | null | undefined): boolean {
  if (!databaseName) return false;
  const normalized = databaseName.trim().toLowerCase();
  return normalized.startsWith("wizfield_")
    || normalized.includes("_verify_")
    || normalized.includes("_smoke_")
    || normalized.endsWith("_verify");
}

export function isPhoenixProductionOrganization(context: Pick<WorkizMutationGuardContext, "organizationId" | "organizationSlug">) {
  if (context.organizationSlug !== PHOENIX_ORG_SLUG) {
    return false;
  }
  return PHOENIX_OPERATING_ORG_IDS.includes(context.organizationId as (typeof PHOENIX_OPERATING_ORG_IDS)[number]);
}

export function isProductionMutationExplicitlyAllowed(allowProductionMutation?: boolean) {
  if (allowProductionMutation === true) return true;
  for (const envName of [WORKIZ_ALLOW_PRODUCTION_MUTATION_ENV, JOBBER_ALLOW_PRODUCTION_MUTATION_ENV]) {
    const env = process.env[envName]?.trim().toLowerCase();
    if (env === "1" || env === "true" || env === "yes" || env === "on") {
      return true;
    }
  }
  return false;
}

export function assertWorkizProductionMutationAllowed(context: WorkizMutationGuardContext) {
  if (!isPhoenixProductionOrganization(context)) {
    return;
  }

  if (isEphemeralWorkizMutationDatabase(context.databaseName)) {
    return;
  }

  if (isProductionMutationExplicitlyAllowed(context.allowProductionMutation)) {
    return;
  }

  throw new Error(
    `${context.commandLabel} refused: Workiz mutation against Phoenix production database `
    + `'${context.databaseName ?? "unknown"}' requires explicit opt-in via `
    + `--allow-production-mutation or ${WORKIZ_ALLOW_PRODUCTION_MUTATION_ENV}=1.`,
  );
}

export function buildWorkizMutationGuardContext(input: {
  dataSourceOptions: MysqlConnectionOptions;
  organizationId: string;
  organizationSlug: string;
  allowProductionMutation?: boolean;
  commandLabel: string;
}): WorkizMutationGuardContext {
  return {
    databaseName: resolveDatabaseNameFromOptions(input.dataSourceOptions),
    organizationId: input.organizationId,
    organizationSlug: input.organizationSlug,
    allowProductionMutation: input.allowProductionMutation,
    commandLabel: input.commandLabel,
  };
}
