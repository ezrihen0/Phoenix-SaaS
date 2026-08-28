export const TEAM_RESPONSIBILITIES = [
  "answer_calls_messages",
  "manage_customers_leads",
  "book_appointments",
  "manage_schedule",
  "dispatch_technicians",
  "perform_field_work",
  "create_estimates",
  "manage_invoices",
  "record_payments",
  "manage_marketing",
  "manage_team_members",
  "manage_business_settings",
] as const;

export type TeamResponsibility = (typeof TEAM_RESPONSIBILITIES)[number];

const OFFICE_SIGNALS = new Set<TeamResponsibility>([
  "answer_calls_messages",
  "manage_customers_leads",
  "book_appointments",
  "create_estimates",
  "manage_invoices",
  "record_payments",
]);

const DISPATCHER_SIGNALS = new Set<TeamResponsibility>([
  "manage_schedule",
  "dispatch_technicians",
]);

const TECHNICIAN_SIGNALS = new Set<TeamResponsibility>([
  "perform_field_work",
]);

const ADMIN_SIGNALS = new Set<TeamResponsibility>([
  "manage_marketing",
  "manage_team_members",
  "manage_business_settings",
]);

export type RoleRecommendation = {
  recommendedRole: "office_admin" | "dispatcher" | "technician" | "admin";
  label: string;
  explanation: string;
  scores: Record<"office_admin" | "dispatcher" | "technician" | "admin", number>;
};

export function recommendRoleFromResponsibilities(
  responsibilities: TeamResponsibility[],
): RoleRecommendation {
  const selected = new Set(responsibilities);
  const scores = {
    office_admin: 0,
    dispatcher: 0,
    technician: 0,
    admin: 0,
  };

  for (const responsibility of selected) {
    if (OFFICE_SIGNALS.has(responsibility)) {
      scores.office_admin += 2;
    }
    if (DISPATCHER_SIGNALS.has(responsibility)) {
      scores.dispatcher += 2;
    }
    if (TECHNICIAN_SIGNALS.has(responsibility)) {
      scores.technician += 3;
    }
    if (ADMIN_SIGNALS.has(responsibility)) {
      scores.admin += 3;
    }
  }

  const ranked = (Object.entries(scores) as Array<[RoleRecommendation["recommendedRole"], number]>)
    .sort((left, right) => right[1] - left[1]);

  const topScore = ranked[0]?.[1] ?? 0;
  const topRoles = ranked.filter(([, score]) => score === topScore && topScore > 0);

  let recommendedRole: RoleRecommendation["recommendedRole"] = "office_admin";
  if (topScore === 0) {
    recommendedRole = "office_admin";
  } else if (topRoles.length === 1) {
    recommendedRole = topRoles[0]![0];
  } else {
    const priority: RoleRecommendation["recommendedRole"][] = [
      "admin",
      "dispatcher",
      "office_admin",
      "technician",
    ];
    recommendedRole = priority.find((role) => topRoles.some(([candidate]) => candidate === role))
      ?? "office_admin";
  }

  const labelMap: Record<RoleRecommendation["recommendedRole"], string> = {
    office_admin: "Office / CSR",
    dispatcher: "Dispatcher",
    technician: "Technician",
    admin: "Admin",
  };

  return {
    recommendedRole,
    label: labelMap[recommendedRole],
    explanation: "Based on the responsibilities selected, this role provides the closest permission match.",
    scores,
  };
}

export function parseTeamResponsibilities(values: unknown): TeamResponsibility[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const allowed = new Set<string>(TEAM_RESPONSIBILITIES);
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value): value is TeamResponsibility => allowed.has(value));
}
