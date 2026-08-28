/** Centralized organization team seat entitlement — change here for V1.6 (maxUsers: 10). */
export const DEFAULT_MAX_USERS = 5;

export function resolveMaxUsers(entitlement: { max_users: number } | null | undefined): number {
  if (!entitlement || !Number.isFinite(entitlement.max_users) || entitlement.max_users < 1) {
    return DEFAULT_MAX_USERS;
  }

  return entitlement.max_users;
}
