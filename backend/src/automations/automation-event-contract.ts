export type AutomationEventSource =
  | "job"
  | "invoice"
  | "payment"
  | "estimate"
  | "call"
  | "messaging"
  | "inventory"
  | "inspection"
  | "report";

export type AutomationEventContract = {
  eventId: string;
  organizationId: string;
  source: AutomationEventSource;
  event: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
  payloadVersion: number;
  payload: Record<string, unknown>;
};

export const automationEventContractExample: AutomationEventContract = {
  eventId: "evt_123",
  organizationId: "org_123",
  source: "invoice",
  event: "invoice.balance_zero",
  entityType: "invoice",
  entityId: "inv_123",
  occurredAt: "2026-05-10T12:00:00Z",
  payloadVersion: 1,
  payload: {},
};

export const automationEventsPersistenceDecision = {
  v1: "service_level_dispatch",
  v15: "automation_events_table_if_debugging_or_replay_is_needed",
  reason: "V1 needs the event contract shape first; persistence can wait until event replay/debugging is required.",
} as const;
