import { createHash } from "crypto";

import type { OfficeDashboardSnapshotPayload } from "../crm/crm-office-dashboard.service";
import { AI_BRAIN_TRACE_SCHEMA_VERSION } from "./ai.constants";

/** Fallback when a typed date is unexpectedly null (audit stability only). Brain rules avoid inferring ages from this value. */
export const BRAIN_UNKNOWN_DATE_SENTINEL_ISO = "1970-01-01T00:00:00.000Z";

export type BrainMinimalInputV1 = {
  trace_schema_version: typeof AI_BRAIN_TRACE_SCHEMA_VERSION;
  as_of: string;
  summary: {
    newLeads: number;
    contactedLeads: number;
    activeJobs: number;
    jobsScheduledToday: number;
    unpaidInvoices: number;
  };
  quotes_waiting: Array<{ id: string; job_id: string | null; sent_at: string }>;
  unpaid_invoices: Array<{ id: string; amount_cents: number | null; issued_at: string }>;
  follow_up_jobs: Array<{ id: string }>;
  leads_open: Array<{ id: string; status: string; created_at: string }>;
};

function iso(d: Date | string | null | undefined): string {
  if (d == null) {
    return BRAIN_UNKNOWN_DATE_SENTINEL_ISO;
  }
  if (d instanceof Date) {
    return d.toISOString();
  }
  return new Date(d).toISOString();
}

function sortBy<T>(rows: T[], key: (row: T) => string | number): T[] {
  return [...rows].sort((a, b) => {
    const va = key(a);
    const vb = key(b);
    if (va < vb) {
      return -1;
    }
    if (va > vb) {
      return 1;
    }
    return 0;
  });
}

export function buildBrainMinimalInputV1(
  snapshot: OfficeDashboardSnapshotPayload,
  asOf: Date,
): BrainMinimalInputV1 {
  const as_of = asOf.toISOString();
  const quotes = sortBy(
    snapshot.controls.quotesWaitingApproval.map((q) => ({
      id: q.id,
      job_id: q.jobId,
      sent_at: iso(q.occurredAt),
    })),
    (r) =>
      `${r.sent_at === BRAIN_UNKNOWN_DATE_SENTINEL_ISO ? "1-unknown" : "0-known"}\0${r.sent_at}\0${r.id}`,
  );
  const unpaid = sortBy(
    snapshot.controls.unpaidInvoices.map((inv) => ({
      id: inv.id,
      amount_cents: inv.amountCents,
      issued_at: iso(inv.occurredAt),
    })),
    (r) =>
      `${r.issued_at === BRAIN_UNKNOWN_DATE_SENTINEL_ISO ? "1-unknown" : "0-known"}\0${r.issued_at}\0${r.id}`,
  );
  const follow = sortBy(
    snapshot.controls.followUpsNeeded.map((j) => ({ id: j.id })),
    (r) => r.id,
  );
  const leads = sortBy(
    snapshot.leads.map((l) => ({
      id: l.id,
      status: l.status,
      created_at: iso(l.created_at),
    })),
    (r) => `${r.created_at}\0${r.id}`,
  );

  return {
    trace_schema_version: AI_BRAIN_TRACE_SCHEMA_VERSION,
    as_of,
    summary: { ...snapshot.summary },
    quotes_waiting: quotes,
    unpaid_invoices: unpaid,
    follow_up_jobs: follow,
    leads_open: leads,
  };
}

export function digestBrainMinimalInputV1(minimal: BrainMinimalInputV1): string {
  const json = JSON.stringify(minimal);
  return createHash("sha256").update(json, "utf8").digest("hex");
}

export function serializedMinimalInputByteLength(minimal: BrainMinimalInputV1): number {
  return Buffer.byteLength(JSON.stringify(minimal), "utf8");
}