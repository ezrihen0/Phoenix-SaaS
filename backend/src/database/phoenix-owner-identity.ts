/** Non-secret Phoenix Fireplace owner identity for runtime services. */

export const PHOENIX_OWNER_EMAIL =
  process.env.PHOENIX_OWNER_EMAIL?.trim().toLowerCase()
  || "service@phoenixfireplace.ca";

export const PHOENIX_OWNER_NAME =
  process.env.PHOENIX_OWNER_NAME?.trim()
  || "Phoenix Owner";
