import {
  DEV_BOOTSTRAP_DEFAULTS,
  isKnownDefaultBootstrapCredential,
  isProductionNodeEnv,
  resolveBootstrapDecision,
} from "../auth/bootstrap-auth.policy";

export type ProductionConfigIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type ProductionConfigValidationResult = {
  ok: boolean;
  nodeEnv: string;
  errors: ProductionConfigIssue[];
  warnings: ProductionConfigIssue[];
};

type EnvLookup = Record<string, string | undefined>;

function readEnv(env: EnvLookup, key: string) {
  return env[key]?.trim() ?? "";
}

function isTruthyFlag(value: string) {
  return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
}

function isLocalhostLike(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes("localhost")
    || normalized.includes("127.0.0.1")
    || normalized.includes("0.0.0.0")
  );
}

function pushError(issues: ProductionConfigIssue[], code: string, message: string) {
  issues.push({ code, message, severity: "error" });
}

function pushWarning(issues: ProductionConfigIssue[], code: string, message: string) {
  issues.push({ code, message, severity: "warning" });
}

export function validateProductionConfig(env: EnvLookup = process.env): ProductionConfigValidationResult {
  const nodeEnv = readEnv(env, "NODE_ENV") || "development";
  const errors: ProductionConfigIssue[] = [];
  const warnings: ProductionConfigIssue[] = [];

  if (!isProductionNodeEnv(nodeEnv)) {
    return { ok: true, nodeEnv, errors, warnings };
  }

  if (!isTruthyFlag(readEnv(env, "SESSION_COOKIE_SECURE"))) {
    pushError(errors, "session_cookie_insecure", "SESSION_COOKIE_SECURE must be true in production.");
  }

  const corsOrigin = readEnv(env, "CORS_ORIGIN");
  if (!corsOrigin) {
    pushError(errors, "cors_origin_missing", "CORS_ORIGIN must be configured in production.");
  } else if (isLocalhostLike(corsOrigin)) {
    pushError(errors, "cors_origin_localhost", "CORS_ORIGIN must not point at localhost in production.");
  }

  if (!readEnv(env, "DB_HOST") || !readEnv(env, "DB_USERNAME") || !readEnv(env, "DB_NAME")) {
    pushError(errors, "database_config_incomplete", "DB_HOST, DB_USERNAME, and DB_NAME are required in production.");
  }

  if (isTruthyFlag(readEnv(env, "DB_SYNCHRONIZE"))) {
    pushError(errors, "db_synchronize_enabled", "DB_SYNCHRONIZE must be false in production.");
  }

  const dbType = readEnv(env, "DB_TYPE") || "mysql";
  if (dbType !== "mysql") {
    pushError(errors, "db_type_unsupported", `DB_TYPE=${dbType} is not supported for production launch verification.`);
  }

  const bootstrapDecision = resolveBootstrapDecision({
    nodeEnv,
    bootstrapEnabled: readEnv(env, "BACKEND_BOOTSTRAP_ENABLED"),
    adminEmail: readEnv(env, "BACKEND_BOOTSTRAP_ADMIN_EMAIL") || DEV_BOOTSTRAP_DEFAULTS.email,
    adminPassword: readEnv(env, "BACKEND_BOOTSTRAP_ADMIN_PASSWORD") || DEV_BOOTSTRAP_DEFAULTS.password,
    adminName: readEnv(env, "BACKEND_BOOTSTRAP_ADMIN_NAME") || DEV_BOOTSTRAP_DEFAULTS.name,
  });

  if (bootstrapDecision.action === "run") {
    pushError(errors, "bootstrap_enabled_in_production", "Production bootstrap must remain disabled unless explicitly approved.");
  }

  const configuredBootstrapEmail = readEnv(env, "BACKEND_BOOTSTRAP_ADMIN_EMAIL");
  const configuredBootstrapPassword = readEnv(env, "BACKEND_BOOTSTRAP_ADMIN_PASSWORD");
  if (configuredBootstrapEmail || configuredBootstrapPassword) {
    const effectiveEmail = configuredBootstrapEmail || DEV_BOOTSTRAP_DEFAULTS.email;
    const effectivePassword = configuredBootstrapPassword || DEV_BOOTSTRAP_DEFAULTS.password;
    if (isKnownDefaultBootstrapCredential(effectiveEmail, effectivePassword)) {
      pushError(
        errors,
        "bootstrap_default_credentials_present",
        "Known default bootstrap credentials must not be configured in production.",
      );
    }
  }

  if (isTruthyFlag(readEnv(env, "AI_FOUNDATION_ENABLED")) && !readEnv(env, "DEEPSEEK_API_KEY")) {
    pushWarning(warnings, "ai_enabled_without_deepseek", "AI foundation is enabled but DEEPSEEK_API_KEY is missing.");
  }

  if (isTruthyFlag(readEnv(env, "MARKETING_PUBLISH_DISPATCHER_ENABLED")) && !readEnv(env, "MARKETING_OAUTH_SECRET_KEY")) {
    pushWarning(
      warnings,
      "marketing_publish_without_oauth_secret",
      "Marketing publish dispatcher is enabled but MARKETING_OAUTH_SECRET_KEY is missing.",
    );
  }

  return {
    ok: errors.length === 0,
    nodeEnv,
    errors,
    warnings,
  };
}

export function assertProductionConfigValid(env: EnvLookup = process.env) {
  const result = validateProductionConfig(env);
  if (!result.ok) {
    const summary = result.errors.map((issue) => `${issue.code}: ${issue.message}`).join("; ");
    throw new Error(`Production configuration validation failed: ${summary}`);
  }
  return result;
}

