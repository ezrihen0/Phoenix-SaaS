import { roleHasPermission } from "../auth/permissions";

export function isTelephonyOfficeRole(role: string | null | undefined) {
  return roleHasPermission(role, "calls.view");
}

export function canDialFromTelephony(role: string | null | undefined) {
  return roleHasPermission(role, "calls.dial");
}

export function canManageCallbackTasks(role: string | null | undefined) {
  return roleHasPermission(role, "calls.callbacks.manage");
}

export function canManageTelephonySettings(role: string | null | undefined) {
  return roleHasPermission(role, "calls.settings.manage");
}
