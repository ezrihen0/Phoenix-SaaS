import type { ActorContext } from "../common/request-types";
import {
  readActorRole,
  type RoleModePermission,
} from "../auth/permissions";
import { listPermissionsForMembership } from "../team/membership-permissions";

export type HomeAiRecordLink = {
  type: "customer" | "lead" | "job" | "estimate" | "invoice" | "schedule";
  id: string;
  label: string;
};

export type HomeAiQuickPrompt = {
  id: string;
  label: string;
  message: string;
};

export type HomeAiRoleProfile = {
  profileKey: string;
  displayName: string;
  greeting: string;
  priorities: string[];
  responseStyle: string;
  preferredDomains: string[];
  deprioritizedDomains: string[];
  quickPrompts: HomeAiQuickPrompt[];
};

const BASE_SYSTEM_GUARDRAILS =
  "You are WizField Home AI — a read-only operational assistant for a field-service business. "
  + "Use only data returned by tools. Never invent records, amounts, or schedules. "
  + "Never perform writes, bookings, payments, or permission changes. "
  + "When data is unavailable due to permissions, say so plainly. "
  + "Keep answers concise and actionable.";

function officeQuickPrompts(): HomeAiQuickPrompt[] {
  return [
    { id: "today-schedule", label: "Today's schedule", message: "What jobs are scheduled for today?" },
    { id: "open-leads", label: "Open leads", message: "Show me new and contacted leads that need follow-up." },
    { id: "active-jobs", label: "Active jobs", message: "What active jobs are in progress right now?" },
    { id: "unpaid-invoices", label: "Unpaid invoices", message: "Which invoices are unpaid or overdue?" },
  ];
}

function technicianQuickPrompts(): HomeAiQuickPrompt[] {
  return [
    { id: "my-today", label: "My schedule today", message: "What jobs am I scheduled for today?" },
    { id: "my-jobs", label: "My open jobs", message: "Show my open assigned jobs." },
    { id: "my-estimates", label: "My estimates", message: "What estimates are tied to my assigned jobs?" },
  ];
}

function dispatcherQuickPrompts(): HomeAiQuickPrompt[] {
  return [
    { id: "dispatch-board", label: "Dispatch board", message: "Summarize today's scheduled jobs and technician coverage." },
    { id: "stalled-leads", label: "Lead backlog", message: "Which leads still need contact or conversion?" },
    { id: "job-status", label: "Job status mix", message: "What is the current mix of open and in-progress jobs?" },
  ];
}

function csrQuickPrompts(): HomeAiQuickPrompt[] {
  return [
    { id: "new-leads", label: "New leads", message: "List new leads that arrived recently." },
    { id: "customer-lookup", label: "Find a customer", message: "Help me find a customer — ask me for a name or phone fragment." },
    { id: "today-calls-jobs", label: "Today's jobs", message: "What customer jobs are scheduled for today?" },
  ];
}

const ROLE_PROFILES: Record<string, Omit<HomeAiRoleProfile, "profileKey">> = {
  owner: {
    displayName: "Owner",
    greeting: "Here's your operational snapshot.",
    priorities: ["revenue", "schedule", "leads", "team load"],
    responseStyle: "Executive summary with numbers and next actions.",
    preferredDomains: ["invoices", "jobs", "leads", "estimates"],
    deprioritizedDomains: ["inventory"],
    quickPrompts: officeQuickPrompts(),
  },
  admin: {
    displayName: "Admin",
    greeting: "Ready to help you run the business.",
    priorities: ["operations", "billing", "schedule", "leads"],
    responseStyle: "Clear operational briefing.",
    preferredDomains: ["jobs", "invoices", "leads", "customers"],
    deprioritizedDomains: ["marketing"],
    quickPrompts: officeQuickPrompts(),
  },
  office_admin: {
    displayName: "Office",
    greeting: "Let's keep the front office moving.",
    priorities: ["leads", "customers", "schedule", "estimates"],
    responseStyle: "Front-desk friendly and specific.",
    preferredDomains: ["leads", "customers", "jobs", "estimates"],
    deprioritizedDomains: ["billing deep dives"],
    quickPrompts: csrQuickPrompts(),
  },
  csr: {
    displayName: "CSR",
    greeting: "How can I help with customers and leads?",
    priorities: ["leads", "customers", "messaging follow-ups"],
    responseStyle: "Customer-service oriented.",
    preferredDomains: ["leads", "customers", "jobs"],
    deprioritizedDomains: ["financial admin"],
    quickPrompts: csrQuickPrompts(),
  },
  dispatcher: {
    displayName: "Dispatcher",
    greeting: "Let's keep the board clear.",
    priorities: ["schedule", "technicians", "job status"],
    responseStyle: "Dispatch-focused and time-aware.",
    preferredDomains: ["schedule", "jobs", "leads"],
    deprioritizedDomains: ["invoices"],
    quickPrompts: dispatcherQuickPrompts(),
  },
  technician: {
    displayName: "Technician",
    greeting: "Here's what's on your route.",
    priorities: ["assigned jobs", "schedule", "estimates on my jobs"],
    responseStyle: "Field-friendly and brief.",
    preferredDomains: ["assigned jobs", "schedule", "estimates"],
    deprioritizedDomains: ["org-wide billing", "lead management"],
    quickPrompts: technicianQuickPrompts(),
  },
  viewer: {
    displayName: "Viewer",
    greeting: "Read-only operational overview.",
    priorities: ["visibility", "status summaries"],
    responseStyle: "Neutral read-only summaries.",
    preferredDomains: ["jobs", "leads", "customers"],
    deprioritizedDomains: ["actions"],
    quickPrompts: officeQuickPrompts().slice(0, 3),
  },
  custom: {
    displayName: "Custom role",
    greeting: "Ask about customers, jobs, schedule, or billing you can access.",
    priorities: ["accessible modules"],
    responseStyle: "Permission-aware summaries only.",
    preferredDomains: [],
    deprioritizedDomains: [],
    quickPrompts: [
      { id: "accessible-summary", label: "My workspace", message: "Summarize what I can see in my workspace today." },
      { id: "my-schedule", label: "Schedule", message: "What schedule information can you show me?" },
    ],
  },
};

function deriveCustomPreferredDomains(permissions: RoleModePermission[]): string[] {
  const domains: string[] = [];
  if (permissions.includes("customers.view")) domains.push("customers");
  if (permissions.includes("leads.view")) domains.push("leads");
  if (permissions.includes("jobs.view") || permissions.includes("jobs.assigned.view")) domains.push("jobs");
  if (permissions.includes("estimates.view") || permissions.includes("estimates.assigned.view")) domains.push("estimates");
  if (permissions.includes("invoices.view") || permissions.includes("invoices.assigned.view")) domains.push("invoices");
  return domains;
}

function buildCustomQuickPrompts(permissions: RoleModePermission[]): HomeAiQuickPrompt[] {
  const prompts: HomeAiQuickPrompt[] = [
    { id: "accessible-summary", label: "My workspace", message: "Summarize what I can see in my workspace today." },
  ];
  if (permissions.includes("jobs.view") || permissions.includes("jobs.assigned.view")) {
    prompts.push({ id: "schedule", label: "Schedule", message: "What jobs are on the schedule?" });
  }
  if (permissions.includes("leads.view")) {
    prompts.push({ id: "leads", label: "Leads", message: "Show recent leads." });
  }
  if (permissions.includes("invoices.view") || permissions.includes("invoices.assigned.view")) {
    prompts.push({ id: "invoices", label: "Invoices", message: "Which invoices need attention?" });
  }
  return prompts.slice(0, 4);
}

export function resolveHomeAiRoleProfile(actor: ActorContext): HomeAiRoleProfile {
  const membership = actor.membership;
  const customRoleName = membership?.custom_role?.name?.trim() ?? null;
  const permissions = membership
    ? listPermissionsForMembership({
        role: membership.role,
        custom_role_id: membership.custom_role_id ?? null,
        custom_permission_keys: membership.custom_permission_keys ?? null,
        custom_role: membership.custom_role ?? null,
      })
    : [];

  const hasCustomPermissions = Boolean(
    membership?.custom_role_id
    || (Array.isArray(membership?.custom_permission_keys) && membership.custom_permission_keys.length > 0),
  );

  if (hasCustomPermissions) {
    return {
      profileKey: "custom",
      displayName: customRoleName ?? "Custom role",
      greeting: ROLE_PROFILES.custom.greeting,
      priorities: deriveCustomPreferredDomains(permissions).length > 0
        ? deriveCustomPreferredDomains(permissions)
        : ROLE_PROFILES.custom.priorities,
      responseStyle: ROLE_PROFILES.custom.responseStyle,
      preferredDomains: deriveCustomPreferredDomains(permissions),
      deprioritizedDomains: ROLE_PROFILES.custom.deprioritizedDomains,
      quickPrompts: buildCustomQuickPrompts(permissions),
    };
  }

  const role = readActorRole(actor) ?? "viewer";
  const base = ROLE_PROFILES[role] ?? ROLE_PROFILES.viewer;
  return {
    profileKey: role,
    ...base,
  };
}

export function buildHomeAiSystemPrompt(actor: ActorContext): string {
  const profile = resolveHomeAiRoleProfile(actor);
  const actorName = actor.profile?.full_name?.trim() || "there";

  return [
    BASE_SYSTEM_GUARDRAILS,
    `User display name: ${actorName}.`,
    `Role profile: ${profile.displayName}.`,
    `Priorities: ${profile.priorities.join(", ")}.`,
    `Response style: ${profile.responseStyle}.`,
    `Preferred domains: ${profile.preferredDomains.join(", ") || "accessible modules only"}.`,
    `Do not discuss: ${profile.deprioritizedDomains.join(", ") || "none"}.`,
    "When referencing records, mention them by label; the client renders safe links from tool metadata.",
  ].join("\n");
}

export function actorCanUseHomeAiTool(
  actor: ActorContext,
  toolKey: string,
): boolean {
  const permissions = new Set(actor.permissions ?? []);

  switch (toolKey) {
    case "search_customers":
      return permissions.has("customers.view");
    case "get_leads":
      return permissions.has("leads.view");
    case "get_jobs":
      return permissions.has("jobs.view") || permissions.has("jobs.assigned.view");
    case "get_schedule":
      return permissions.has("jobs.view") || permissions.has("jobs.assigned.view");
    case "get_estimates":
      return permissions.has("estimates.view") || permissions.has("estimates.assigned.view");
    case "get_invoices":
      return permissions.has("invoices.view") || permissions.has("invoices.assigned.view");
    default:
      return false;
  }
}
