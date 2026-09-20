/** Canonical Phoenix Fireplace owner credentials for activation and verification scripts. */

import {
  PHOENIX_OWNER_EMAIL as IDENTITY_PHOENIX_OWNER_EMAIL,
  PHOENIX_OWNER_NAME as IDENTITY_PHOENIX_OWNER_NAME,
} from "./phoenix-owner-identity";

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

export const PHOENIX_OWNER_EMAIL = IDENTITY_PHOENIX_OWNER_EMAIL;

export const PHOENIX_OWNER_PASSWORD = requirePhoenixOwnerPassword();

export const PHOENIX_OWNER_NAME = IDENTITY_PHOENIX_OWNER_NAME;

/** Previous owner email retained for one-time credential migration. */
export const LEGACY_PHOENIX_OWNER_EMAIL = "owner@phoenixfireplace.com";
