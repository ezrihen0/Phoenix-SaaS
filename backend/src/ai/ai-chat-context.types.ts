/** Monotonic bump when Smart V1 chat context envelope shape changes. */
export const AI_CHAT_CONTEXT_SCHEMA_VERSION = "smart_v1";

export const AI_CHAT_CONTEXT_MAX_PER_CATEGORY = 5;

export type AiChatSmartContextV1 = {
  schema_version: typeof AI_CHAT_CONTEXT_SCHEMA_VERSION;
  as_of: string;
  organization: {
    display_name: string;
  };
  actor: {
    role: string | null;
    can_view_financials: boolean;
    can_view_jobs: boolean;
    can_view_calls: boolean;
    can_view_leads: boolean;
  };
  dashboard_summary: {
    new_leads: number;
    contacted_leads: number;
    active_jobs: number;
    jobs_scheduled_today: number;
    unpaid_invoices: number;
  };
  unpaid_invoices: Array<{
    id: string;
    amount_cents: number | null;
    status_label: string;
    customer_label: string;
    issued_at: string | null;
  }>;
  stale_estimates: Array<{
    id: string;
    job_id: string | null;
    amount_cents: number | null;
    status_label: string;
    customer_label: string;
    waiting_since: string | null;
  }>;
  todays_jobs: Array<{
    id: string;
    title: string;
    status_label: string;
    customer_label: string;
    scheduled_for: string | null;
    city_label: string | null;
  }>;
  recent_leads: Array<{
    id: string;
    status: string;
    source: string;
    customer_label: string;
    city_label: string | null;
    created_at: string;
  }>;
  recent_and_missed_calls: Array<{
    id: string;
    call_status: string;
    is_missed: boolean;
    customer_label: string | null;
    source: string;
    started_at: string | null;
    duration_seconds: number | null;
  }>;
  data_limits: {
    max_per_category: number;
    note: string;
  };
};
