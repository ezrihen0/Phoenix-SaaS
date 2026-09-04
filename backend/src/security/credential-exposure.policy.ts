import {
  KNOWN_DEFAULT_BOOTSTRAP_PASSWORD,
} from "../auth/bootstrap-auth.policy";

/** Files allowed to retain known-default literals for detection/rejection logic only. */
export const CREDENTIAL_DETECTION_ALLOWLIST = new Set([
  "backend/src/auth/bootstrap-auth.policy.ts",
]);

/** Password literals that must never appear in example/tracked config (except allowlist). */
export const KNOWN_UNSAFE_EXAMPLE_PASSWORDS = new Set([
  KNOWN_DEFAULT_BOOTSTRAP_PASSWORD,
  "Fireplace1234!",
]);

const PLACEHOLDER_TOKENS = new Set([
  "",
  "changeme",
  "change-me",
  "change_me",
  "placeholder",
  "your-api-key-here",
  "your_api_key_here",
  "set-in-local-env-only",
  "set-in-local-env",
  "local-dev-only",
  "example",
  "xxx",
  "todo",
]);

const ENV_CREDENTIAL_KEY =
  /^(?:[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|AUTH_TOKEN|CLIENT_SECRET|OAUTH_SECRET_KEY))$/;

export type SourceSecretRule = {
  code: string;
  pattern: RegExp;
  message: string;
};

export const SOURCE_SECRET_RULES: SourceSecretRule[] = [
  {
    code: "stripe_secret_key",
    pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{8,}\b/,
    message: "Stripe secret key pattern detected.",
  },
  {
    code: "stripe_webhook_secret",
    pattern: /\bwhsec_[A-Za-z0-9]{8,}\b/,
    message: "Stripe webhook secret pattern detected.",
  },
  {
    code: "telnyx_api_key",
    pattern: /\bKEY[A-F0-9]{20,}\b/,
    message: "Telnyx-style API key pattern detected.",
  },
  {
    code: "openai_api_key",
    pattern: /\bsk-[A-Za-z0-9]{20,}\b/,
    message: "OpenAI-style API key pattern detected.",
  },
  {
    code: "google_api_key",
    pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/,
    message: "Google API key pattern detected.",
  },
  {
    code: "private_key_block",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    message: "Private key block detected.",
  },
  {
    code: "jwt_like_secret",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    message: "JWT-like token detected.",
  },
  {
    code: "generic_api_key_assignment",
    pattern: /\b[A-Z0-9_]*API_KEY\s*=\s*["'][^"'\s]{8,}["']/,
    message: "Hardcoded API key assignment detected.",
  },
  {
    code: "generic_secret_assignment",
    pattern: /\b[A-Z0-9_]*(?:SECRET(?:_KEY)?|AUTH_TOKEN|CLIENT_SECRET)\s*=\s*["'][^"'\s]{8,}["']/,
    message: "Hardcoded secret assignment detected.",
  },
  {
    code: "generic_password_assignment",
    pattern: /\b(?:PASSWORD|ADMIN_PASSWORD|OWNER_PASSWORD)\s*=\s*["'][^"'\s]{6,}["']/,
    message: "Hardcoded password assignment detected.",
  },
];

export function normalizeRepoPath(relativePath: string) {
  return relativePath.replace(/\\/g, "/");
}

export function isAllowlistedDetectionFile(relativePath: string) {
  return CREDENTIAL_DETECTION_ALLOWLIST.has(normalizeRepoPath(relativePath));
}

export function isPlaceholderCredentialValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }

  const unquoted = trimmed.replace(/^['"]|['"]$/g, "");
  const normalized = unquoted.trim().toLowerCase();
  if (PLACEHOLDER_TOKENS.has(normalized)) {
    return true;
  }

  if (/^<[^>]+>$/.test(unquoted)) {
    return true;
  }

  if (/^(?:your[-_ ]|set[-_ ]|local[-_ ]|replace[-_ ])/i.test(unquoted)) {
    return true;
  }

  return false;
}

export function isUnsafeExampleCredentialValue(key: string, value: string) {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) {
    return false;
  }

  if (KNOWN_UNSAFE_EXAMPLE_PASSWORDS.has(trimmed)) {
    return true;
  }

  if (ENV_CREDENTIAL_KEY.test(key)) {
    if (isPlaceholderCredentialValue(trimmed)) {
      return false;
    }

    if (key.endsWith("_PASSWORD") && (key === "DB_PASSWORD" || key === "MYSQL_PASSWORD" || key === "MYSQL_ROOT_PASSWORD")) {
      return false;
    }

    return true;
  }

  return false;
}

export function findCredentialExposureInSource(relativePath: string, content: string) {
  const normalizedPath = normalizeRepoPath(relativePath);
  if (isAllowlistedDetectionFile(normalizedPath)) {
    return [] as string[];
  }

  const findings: string[] = [];
  for (const rule of SOURCE_SECRET_RULES) {
    if (rule.pattern.test(content)) {
      findings.push(`${normalizedPath}: ${rule.message}`);
    }
  }

  return findings;
}

export function findCredentialExposureInEnvExample(relativePath: string, content: string) {
  const normalizedPath = normalizeRepoPath(relativePath);
  const findings: string[] = [];

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1);

    if (isUnsafeExampleCredentialValue(key, value)) {
      findings.push(`${normalizedPath}: ${key} must use a placeholder or remain empty in example env files.`);
    }
  }

  return findings;
}

export function findUnsafeDefaultsInLocalEnv(content: string) {
  const findings: string[] = [];

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!value) {
      continue;
    }

    if (key === "BACKEND_BOOTSTRAP_ADMIN_PASSWORD" && value === KNOWN_DEFAULT_BOOTSTRAP_PASSWORD) {
      findings.push(`${key} uses the known insecure bootstrap default password.`);
      continue;
    }

    if (key === "PHOENIX_OWNER_PASSWORD" && KNOWN_UNSAFE_EXAMPLE_PASSWORDS.has(value)) {
      findings.push(`${key} uses the known insecure Phoenix example password.`);
    }
  }

  return findings;
}

export function isScannableRepoFile(relativePath: string) {
  const normalized = normalizeRepoPath(relativePath);
  if (normalized.endsWith(".png") || normalized.endsWith(".jpg") || normalized.endsWith(".jpeg") || normalized.endsWith(".webp")) {
    return false;
  }
  if (normalized.endsWith(".pdf") || normalized.endsWith(".zip") || normalized.endsWith(".woff") || normalized.endsWith(".woff2")) {
    return false;
  }
  if (normalized.split("/").pop() === "package-lock.json") {
    return false;
  }

  return (
    normalized.endsWith(".ts")
    || normalized.endsWith(".tsx")
    || normalized.endsWith(".js")
    || normalized.endsWith(".jsx")
    || normalized.endsWith(".json")
    || normalized.endsWith(".md")
    || normalized.endsWith(".env.example")
    || normalized.endsWith(".yml")
    || normalized.endsWith(".yaml")
    || normalized.endsWith(".mjs")
  );
}
