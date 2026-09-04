import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

export const PHOENIX_ORG_ID = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";
export const PHOENIX_ORG_SLUG = "phoenix-fireplace";

export const WORKIZ_ALLOW_PRODUCTION_MUTATION_ENV = "WORKIZ_ALLOW_PRODUCTION_MUTATION";

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
  return context.organizationId === PHOENIX_ORG_ID
    && context.organizationSlug === PHOENIX_ORG_SLUG;
}

export function isProductionMutationExplicitlyAllowed(allowProductionMutation?: boolean) {
  if (allowProductionMutation === true) return true;
  const env = process.env[WORKIZ_ALLOW_PRODUCTION_MUTATION_ENV]?.trim().toLowerCase();
  return env === "1" || env === "true" || env === "yes" || env === "on";
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
