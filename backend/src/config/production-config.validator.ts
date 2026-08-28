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

function isLaunchBillingEnabled(env: EnvLookup) {
  if (isTruthyFlag(readEnv(env, "BILLING_LAUNCH_ENABLED"))) {
    return true;
  }

  return Boolean(readEnv(env, "STRIPE_SECRET_KEY"));
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

  const successUrl = readEnv(env, "STRIPE_CHECKOUT_SUCCESS_URL");
  const cancelUrl = readEnv(env, "STRIPE_CHECKOUT_CANCEL_URL");
  if (successUrl && isLocalhostLike(successUrl)) {
    pushError(errors, "stripe_success_url_localhost", "STRIPE_CHECKOUT_SUCCESS_URL must not use localhost in production.");
  }
  if (cancelUrl && isLocalhostLike(cancelUrl)) {
    pushError(errors, "stripe_cancel_url_localhost", "STRIPE_CHECKOUT_CANCEL_URL must not use localhost in production.");
  }

  if (isLaunchBillingEnabled(env)) {
    if (!readEnv(env, "STRIPE_SECRET_KEY")) {
      pushError(errors, "stripe_secret_missing", "STRIPE_SECRET_KEY is required when launch billing is enabled.");
    }
    if (!readEnv(env, "STRIPE_WEBHOOK_SECRET")) {
      pushError(errors, "stripe_webhook_secret_missing", "STRIPE_WEBHOOK_SECRET is required when launch billing is enabled.");
    }
    for (const priceEnvKey of ["STRIPE_PRICE_STARTER", "STRIPE_PRICE_PRO", "STRIPE_PRICE_BUSINESS"]) {
      if (!readEnv(env, priceEnvKey)) {
        pushError(errors, "stripe_price_missing", `${priceEnvKey} is required when launch billing is enabled.`);
      }
    }
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

  if (
    isKnownDefaultBootstrapCredential(
      readEnv(env, "BACKEND_BOOTSTRAP_ADMIN_EMAIL") || DEV_BOOTSTRAP_DEFAULTS.email,
      readEnv(env, "BACKEND_BOOTSTRAP_ADMIN_PASSWORD") || DEV_BOOTSTRAP_DEFAULTS.password,
    )
  ) {
    pushWarning(
      warnings,
      "bootstrap_default_credentials_present",
      "Default bootstrap credentials are present in the environment and must not be used in production.",
    );
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
