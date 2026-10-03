export type AssignmentEligibilityMode = "off" | "shadow" | "enforce";

export function readAssignmentEligibilityMode(
  env: NodeJS.ProcessEnv = process.env,
): AssignmentEligibilityMode {
  const raw = (env.TEAM_ASSIGNMENT_ELIGIBILITY_MODE ?? "off").trim().toLowerCase();
  if (raw === "shadow" || raw === "enforce") {
    return raw;
  }

  return "off";
}

/** Edit member modal + admin password reset API (staging/dev until production rollout). */
export function isTeamMemberEditEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.TEAM_MEMBER_EDIT_UI_ENABLED ?? "").trim().toLowerCase() === "true";
}

export function defaultAssignableForSystemRole(systemRole: string): boolean {
  return systemRole.trim().toLowerCase() === "technician";
}

/** Saved denials are always enforced for new assignments once the column is set. */
export function isExplicitAssignmentDenial(
  assignableToJobs: boolean | null | undefined,
): boolean {
  return assignableToJobs === false;
}
