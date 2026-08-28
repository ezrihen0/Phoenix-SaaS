export const KNOWN_DEFAULT_BOOTSTRAP_EMAILS = new Set([
  "admin@phoenixcrm.local",
  "admin@wizfield.local",
]);

export const KNOWN_DEFAULT_BOOTSTRAP_PASSWORD = "Admin12345!";

export const DEV_BOOTSTRAP_DEFAULTS = {
  email: "admin@phoenixcrm.local",
  password: KNOWN_DEFAULT_BOOTSTRAP_PASSWORD,
  name: "Phoenix Admin",
} as const;

export type BootstrapEnvInput = {
  nodeEnv?: string;
  bootstrapEnabled?: string;
  adminEmail?: string;
  adminPassword?: string;
  adminName?: string;
};

export type BootstrapDecision =
  | { action: "skip"; reason: string }
  | { action: "run"; adminEmail: string; adminPassword: string; adminName: string };

export function isProductionNodeEnv(nodeEnv: string | undefined): boolean {
  return (nodeEnv ?? "").trim().toLowerCase() === "production";
}

export function isTruthyEnvFlag(value: string | undefined): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}

export function isKnownDefaultBootstrapCredential(email: string, password: string): boolean {
  return KNOWN_DEFAULT_BOOTSTRAP_EMAILS.has(email.trim().toLowerCase())
    && password === KNOWN_DEFAULT_BOOTSTRAP_PASSWORD;
}

export function resolveBootstrapDecision(input: BootstrapEnvInput): BootstrapDecision {
  const isProduction = isProductionNodeEnv(input.nodeEnv);
  const rawEmail = input.adminEmail?.trim();
  const rawPassword = input.adminPassword;
  const rawName = input.adminName?.trim();

  if (isProduction) {
    if (!isTruthyEnvFlag(input.bootstrapEnabled)) {
      return { action: "skip", reason: "production_bootstrap_disabled" };
    }

    if (!rawEmail || !rawPassword?.length) {
      return { action: "skip", reason: "production_bootstrap_credentials_missing" };
    }

    const adminEmail = rawEmail.toLowerCase();

    if (isKnownDefaultBootstrapCredential(adminEmail, rawPassword)) {
      return { action: "skip", reason: "production_default_bootstrap_credentials_rejected" };
    }

    return {
      action: "run",
      adminEmail,
      adminPassword: rawPassword,
      adminName: rawName || DEV_BOOTSTRAP_DEFAULTS.name,
    };
  }

  const adminEmail = (rawEmail ?? DEV_BOOTSTRAP_DEFAULTS.email).trim().toLowerCase();
  const adminPassword = rawPassword ?? DEV_BOOTSTRAP_DEFAULTS.password;
  const adminName = rawName || DEV_BOOTSTRAP_DEFAULTS.name;

  if (!adminEmail || !adminPassword) {
    return { action: "skip", reason: "bootstrap_credentials_missing" };
  }

  return {
    action: "run",
    adminEmail,
    adminPassword,
    adminName,
  };
}

export function shouldWarnAboutDefaultBootstrapCredentials(
  nodeEnv: string | undefined,
  email: string,
  password: string,
): boolean {
  return !isProductionNodeEnv(nodeEnv) && isKnownDefaultBootstrapCredential(email, password);
}

export function shouldAutoAttachDefaultOrganizationMembership(nodeEnv: string | undefined): boolean {
  return !isProductionNodeEnv(nodeEnv);
}
