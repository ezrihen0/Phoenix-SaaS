/** Canonical Phoenix Fireplace owner credentials for activation and verification scripts. */

function requirePhoenixOwnerPassword(): string {
  const password = process.env.PHOENIX_OWNER_PASSWORD?.trim();
  if (!password) {
    throw new Error(
      "PHOENIX_OWNER_PASSWORD is required for Phoenix owner scripts. "
      + "Set it in backend/.env (never commit real values).",
    );
  }
  return password;
}

export const PHOENIX_OWNER_EMAIL =
  process.env.PHOENIX_OWNER_EMAIL?.trim().toLowerCase() || "phoenixfireplace0@gmail.com";

export const PHOENIX_OWNER_PASSWORD = requirePhoenixOwnerPassword();

export const PHOENIX_OWNER_NAME =
  process.env.PHOENIX_OWNER_NAME?.trim() || "Phoenix Owner";

/** Previous owner email retained for one-time credential migration. */
export const LEGACY_PHOENIX_OWNER_EMAIL = "owner@phoenixfireplace.com";
