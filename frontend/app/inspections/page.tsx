import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";

import { requireServerSession } from "@/lib/auth/server-session";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { isProbablyMobileUserAgent } from "@/lib/device/desktop-only";
import { headers } from "next/headers";

import InspectionsWorkspace from "./inspections-workspace";

type InspectionListRow = {
  id: string;
  customer_id?: string;
  client_name: string | null;
  address: string | null;
  report_type: string;
  workflow_type: string;
  status: string;
  compliance_status: string | null;
  safety_score: number | null;
  updated_at: string;
  sent_to_customer_at: string | null;
  archived_at: string | null;
};

const reportTypeLabels: Record<string, string> = {
  wood_burning_fireplace: "Standard",
  wood_stove: "Wood Stove",
  wett_inspection: "WETT Site Basic",
  gas_fireplace: "Gas Fireplace",
  garage_door: "Garage Door",
  hvac: "HVAC",
};

function statusBadge(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("generated") || normalized.includes("complete") || normalized.includes("ready") || normalized.includes("sent")) {
    return "theme-status-success inline-flex rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em]";
  }
  if (normalized.includes("draft")) {
    return "theme-badge inline-flex rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em]";
  }
  return "theme-status-warning inline-flex rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em]";
}

function MobileInspectionsHub({ inspections }: { inspections: InspectionListRow[] }) {
  return (
    <div className="min-h-screen bg-[color:var(--cmp-surface-canvas)] pb-28 text-[color:var(--sem-text-primary)]">
      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        <div>
          <h1 className="text-2xl font-bold">Inspections</h1>
          <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">
            Create and manage inspection reports from the field.
          </p>
        </div>

        <Link
          href="/inspections/new"
          className="flex items-center justify-center gap-2 rounded-xl bg-[color:var(--sem-accent-primary)] px-6 py-3.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <ClipboardList className="h-4 w-4" />
          New Inspection
        </Link>

        {inspections.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
              Recent inspections ({inspections.length})
            </p>
            {inspections.map((row) => (
              <Link
                key={row.id}
                href={`/inspections/${row.id}/mobile`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4 transition hover:border-[color:var(--cmp-border-accent)]"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {reportTypeLabels[row.report_type] ?? row.report_type}
                  </p>
                  {row.client_name ? (
                    <p className="mt-0.5 text-xs text-[color:var(--sem-text-secondary)]">{row.client_name}</p>
                  ) : null}
                  {row.address ? (
                    <p className="text-xs text-[color:var(--sem-text-muted)] truncate">{row.address}</p>
                  ) : null}
                  <p className="mt-1 text-[10px] text-[color:var(--sem-text-muted)]">
                    {new Date(row.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={statusBadge(row.status)}>{row.status.replace(/_/g, " ")}</span>
                  <ArrowRight className="h-4 w-4 text-[color:var(--sem-text-muted)]" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-6 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-[color:var(--sem-text-muted)]" />
            <p className="mt-3 text-sm text-[color:var(--sem-text-secondary)]">No inspections yet.</p>
            <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">
              Create your first inspection report from the field.
            </p>
          </div>
        )}

        <p className="text-center text-xs text-[color:var(--sem-text-muted)]">
          Full desktop workspace available for advanced report editing.
        </p>
      </div>
    </div>
  );
}

export default async function InspectionsPage() {
  const session = await requireServerSession("/inspections");
  const sessionRole = session.profile?.role ?? session.active_membership?.role ?? null;
  const userAgent = (await headers()).get("user-agent");
  const isMobile = isProbablyMobileUserAgent(userAgent);

  let inspections: InspectionListRow[] = [];

  if (isMobile) {
    try {
      inspections = await serverApiFetch<InspectionListRow[]>("/api/inspections");
    } catch {
      inspections = [];
    }
    return <MobileInspectionsHub inspections={inspections} />;
  }

  return (
    <InspectionsWorkspace
      permissions={session.permissions}
      sessionRole={sessionRole}
    />
  );
}
