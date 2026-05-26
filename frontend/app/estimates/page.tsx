import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  Briefcase,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileClock,
  FileText,
  Plus,
  Search,
  Sparkles,
  UserRound,
  WandSparkles,
} from "lucide-react";

import { BoardShell } from "@/components/board/board-shell";
import { MetricTile } from "@/components/board/metric-tile";
import {
  MasterMobileList,
  MasterTable,
  MasterTablePagination,
  MasterTableRow,
  type MasterTableState,
} from "@/components/master-table";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerRoles } from "@/lib/auth/server-session";
import { formatLocalizedCurrency } from "@/lib/i18n/formatters";

const SHOW_LEGACY_ESTIMATES_INDEX = false;

type SearchParam = string | string[] | undefined;

type EstimateStatus = "draft" | "sent" | "approved" | "rejected";
type EstimateLifecycleStatus = "draft" | "sent" | "approved" | "void" | "converted";
type PipelineFilter = "all" | "draft" | "sent" | "approved" | "closed";
type FollowUpTone = "default" | "warning" | "success" | "error";

/** UI-only reference shape for a future backend AI insight payload. Not fetched in this slice. */
type EstimateAiInsight = {
  estimateId: string;
  priority: "low" | "medium" | "high" | "urgent";
  label: string;
  summary: string;
  recommendedAction: "call" | "sms" | "email" | "wait" | "convert_to_job";
  confidence: number;
  generatedAt: string;
  source: "ai";
};

type EstimateAiReadyState = {
  mode: "standby" | "connected";
  insights: EstimateAiInsight[];
};

type EstimateNextStep = {
  label: string;
  detail: string;
  tone: FollowUpTone;
};

type EstimateListItem = {
  id: string;
  job_id: string;
  customer_id: string;
  customer_name: string;
  job_title: string;
  document_number: string;
  lifecycle_status: EstimateLifecycleStatus;
  description: string;
  price_cents: number;
  status: EstimateStatus;
  sent_at: string | null;
  approved_at: string | null;
};

type EstimatesPageContext = {
  searchParams: Promise<{
    status?: SearchParam;
    lifecycleStatus?: SearchParam;
    q?: SearchParam;
    customerId?: SearchParam;
    jobId?: SearchParam;
    page?: SearchParam;
    pageSize?: SearchParam;
    pipeline?: SearchParam;
  }>;
};

const estimateActionIconBaseClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--cmp-border-subtle)] text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cmp-focus-ring)]";
const estimateOpenIconClass = `${estimateActionIconBaseClass} bg-amber-500 hover:bg-amber-600`;
const estimateCustomerIconClass = `${estimateActionIconBaseClass} bg-sky-600 hover:bg-sky-700`;
const estimateJobIconClass = `${estimateActionIconBaseClass} bg-orange-600 hover:bg-orange-700`;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function firstValue(value: SearchParam) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePipeline(value: string | undefined): PipelineFilter {
  if (value === "draft" || value === "sent" || value === "approved" || value === "closed") {
    return value;
  }
  return "all";
}

function formatCurrency(cents: number, locale: string) {
  return formatLocalizedCurrency(cents / 100, locale as never, "USD");
}

function formatDate(value: string | null, locale: string) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function formatLifecycleStatus(status: EstimateLifecycleStatus) {
  if (status === "void") {
    return "Voided";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatPersistedStatus(status: EstimateStatus) {
  if (status === "rejected") {
    return "Rejected";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function lifecycleBadgeClass(status: EstimateLifecycleStatus) {
  if (status === "approved" || status === "converted") {
    return "theme-status-success inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]";
  }

  if (status === "sent") {
    return "theme-status-warning inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]";
  }

  if (status === "void") {
    return "theme-status-error inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]";
  }

  return "theme-badge inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]";
}

function estimateStatusBadgeClass(status: EstimateStatus) {
  if (status === "approved") {
    return "theme-status-success inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]";
  }

  if (status === "sent") {
    return "theme-status-warning inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]";
  }

  if (status === "rejected") {
    return "theme-status-error inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]";
  }

  return "theme-badge inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]";
}

function getPrimaryEstimateStatus(estimate: EstimateListItem) {
  if (estimate.lifecycle_status === "converted") {
    return {
      label: formatLifecycleStatus(estimate.lifecycle_status),
      className: lifecycleBadgeClass(estimate.lifecycle_status),
    };
  }

  return {
    label: formatPersistedStatus(estimate.status),
    className: estimateStatusBadgeClass(estimate.status),
  };
}

function shouldShowLifecycleBadge(estimate: EstimateListItem) {
  return estimate.lifecycle_status !== "converted" && estimate.lifecycle_status !== estimate.status;
}

function isApprovedEstimate(estimate: EstimateListItem) {
  return (
    estimate.status === "approved" ||
    estimate.lifecycle_status === "approved" ||
    estimate.lifecycle_status === "converted"
  );
}

function isPendingSentEstimate(estimate: EstimateListItem) {
  return estimate.status === "sent" && !isApprovedEstimate(estimate) && estimate.lifecycle_status !== "void";
}

function isApprovedThisMonth(approvedAt: string | null) {
  if (!approvedAt) {
    return false;
  }

  const approved = new Date(approvedAt);
  const now = new Date();
  return approved.getFullYear() === now.getFullYear() && approved.getMonth() === now.getMonth();
}

function getEstimateAiReadyState(insights: EstimateAiInsight[] = []): EstimateAiReadyState {
  if (insights.length > 0) {
    return { mode: "connected", insights };
  }

  return { mode: "standby", insights: [] };
}

function findEstimateAiInsight(estimateId: string, insights: EstimateAiInsight[]) {
  return insights.find((insight) => insight.estimateId === estimateId) ?? null;
}

function getEstimateNextStep(estimate: EstimateListItem, locale: string): EstimateNextStep {
  if (estimate.lifecycle_status === "void") {
    return {
      label: "Review voided estimate",
      detail: "Confirm whether this voided proposal should stay archived.",
      tone: "error",
    };
  }

  if (estimate.status === "rejected") {
    return {
      label: "Review or archive",
      detail: "Customer declined this estimate. Decide whether to revise or close it out.",
      tone: "error",
    };
  }

  if (isApprovedEstimate(estimate)) {
    return {
      label: "Open related job",
      detail: "Approved work should move forward on the linked job record.",
      tone: "success",
    };
  }

  if (estimate.status === "sent") {
    return {
      label: "Follow up with customer",
      detail: estimate.sent_at
        ? `Sent ${formatDate(estimate.sent_at, locale)}. Check for approval or questions.`
        : "Waiting for customer response.",
      tone: "warning",
    };
  }

  return {
    label: "Finish and send",
    detail: "Complete scope details and send the estimate to the customer.",
    tone: "default",
  };
}

function followUpToneClass(tone: FollowUpTone) {
  if (tone === "success") {
    return "border-[color:var(--cmp-status-success-border)] bg-[color:var(--cmp-status-success-bg)] text-[color:var(--cmp-status-success-text)]";
  }
  if (tone === "warning") {
    return "border-[color:var(--cmp-status-warning-border)] bg-[color:var(--cmp-status-warning-bg)] text-[color:var(--cmp-status-warning-text)]";
  }
  if (tone === "error") {
    return "border-[color:var(--cmp-status-error-border)] bg-[color:var(--cmp-status-error-bg)] text-[color:var(--cmp-status-error-text)]";
  }
  return "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/80 text-[color:var(--sem-text-secondary)]";
}

function buildStatusFollowUpQueue(estimates: EstimateListItem[]) {
  return estimates
    .filter((estimate) => isPendingSentEstimate(estimate) && estimate.sent_at)
    .sort((left, right) => {
      const leftTime = new Date(left.sent_at!).getTime();
      const rightTime = new Date(right.sent_at!).getTime();
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return right.price_cents - left.price_cents;
    })
    .slice(0, 3);
}

function resolveApiFilters(pipeline: PipelineFilter, status: EstimateStatus | "", lifecycleStatus: EstimateLifecycleStatus | "") {
  if (pipeline === "draft") {
    return { status: "draft" as const, lifecycleStatus: "" as const };
  }
  if (pipeline === "sent") {
    return { status: "sent" as const, lifecycleStatus: "" as const };
  }
  if (pipeline === "approved") {
    return { status: "approved" as const, lifecycleStatus: "" as const };
  }
  if (pipeline === "closed") {
    return { status: "" as const, lifecycleStatus: "" as const };
  }
  return { status, lifecycleStatus };
}

function applyPipelineFilter(estimates: EstimateListItem[], pipeline: PipelineFilter) {
  if (pipeline === "closed") {
    return estimates.filter((estimate) => estimate.status === "rejected" || estimate.lifecycle_status === "void");
  }
  return estimates;
}

function buildQueryString(params: Record<string, string | null | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value && value.trim()) {
      searchParams.set(key, value);
    }
  }

  const serialized = searchParams.toString();
  return serialized ? `?${serialized}` : "";
}

function deriveEstimateMetrics(estimates: EstimateListItem[]) {
  const totalPipelineCents = estimates.reduce((total, estimate) => total + estimate.price_cents, 0);
  const pendingEstimates = estimates.filter((estimate) => isPendingSentEstimate(estimate));
  const pendingValueCents = pendingEstimates.reduce((total, estimate) => total + estimate.price_cents, 0);
  const approvedEstimates = estimates.filter((estimate) => isApprovedEstimate(estimate));
  const approvedValueCents = approvedEstimates.reduce((total, estimate) => total + estimate.price_cents, 0);
  const approvedThisMonthEstimates = estimates.filter((estimate) => isApprovedThisMonth(estimate.approved_at));
  const approvedThisMonthCents = approvedThisMonthEstimates.reduce((total, estimate) => total + estimate.price_cents, 0);

  return {
    totalPipelineCents,
    pendingCount: pendingEstimates.length,
    pendingValueCents,
    approvedCount: approvedEstimates.length,
    approvedValueCents,
    approvedThisMonthCount: approvedThisMonthEstimates.length,
    approvedThisMonthCents,
  };
}

function EstimateFollowUpSignal({
  estimate,
  aiState,
  statusBasedLabel,
  locale,
}: {
  estimate: EstimateListItem;
  aiState: EstimateAiReadyState;
  statusBasedLabel: string;
  locale: string;
}) {
  const aiInsight = aiState.mode === "connected" ? findEstimateAiInsight(estimate.id, aiState.insights) : null;

  if (aiInsight) {
    return (
      <div className="max-w-[310px] rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] px-3 py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[color:var(--sem-accent-primary)]" />
          <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--sem-accent-primary)]">{aiInsight.label}</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-[color:var(--sem-text-secondary)]">{aiInsight.summary}</p>
      </div>
    );
  }

  const nextStep = getEstimateNextStep(estimate, locale);

  return (
    <div className={cx("max-w-[310px] rounded-2xl border px-3 py-2", followUpToneClass(nextStep.tone))}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">{statusBasedLabel}</span>
      </div>
      <p className="mt-1 text-xs font-semibold">{nextStep.label}</p>
      <p className="mt-1 text-xs leading-5 opacity-80">{nextStep.detail}</p>
    </div>
  );
}

function AiFollowUpAssistantPanel({
  estimates,
  aiState,
  locale,
  labels,
}: {
  estimates: EstimateListItem[];
  aiState: EstimateAiReadyState;
  locale: string;
  labels: {
    title: string;
    readyTitle: string;
    readyBody: string;
    noAutonomy: string;
    standby: string;
    queueTitle: string;
    queueHelper: string;
    openEstimate: string;
    openCustomer: string;
  };
}) {
  const queue = buildStatusFollowUpQueue(estimates);

  return (
    <aside
      id="estimate-ai-assistant"
      className="rounded-[30px] border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] p-5 shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)]"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] text-[color:var(--sem-accent-primary)]">
          <WandSparkles className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">{labels.title}</p>
          <h3 className="mt-1 text-xl font-semibold text-[color:var(--sem-text-primary)]">{labels.readyTitle}</h3>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/60 p-4">
        <p className="text-sm leading-6 text-[color:var(--sem-text-secondary)]">{labels.readyBody}</p>
        <p className="mt-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{labels.noAutonomy}</p>
        {aiState.mode === "standby" ? (
          <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">{labels.standby}</p>
        ) : null}
      </div>

      <div className="mt-5">
        <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">{labels.queueTitle}</p>
        <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{labels.queueHelper}</p>
        <div className="mt-4 space-y-3">
          {queue.length === 0 ? (
            <div className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
              No sent estimates need follow-up in the current view.
            </div>
          ) : (
            queue.map((estimate, index) => (
              <div key={estimate.id} className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Queue #{index + 1}</p>
                    <h4 className="mt-1 truncate font-semibold text-[color:var(--sem-text-primary)]">{estimate.document_number}</h4>
                    <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">{estimate.customer_name}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--sem-text-muted)]">{estimate.description || estimate.job_title}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[color:var(--cmp-status-success-border)] bg-[color:var(--cmp-status-success-bg)] px-3 py-1 text-xs font-semibold text-[color:var(--cmp-status-success-text)]">
                    {formatCurrency(estimate.price_cents, locale)}
                  </span>
                </div>
                <p className="mt-3 text-xs text-[color:var(--sem-text-muted)]">Sent {formatDate(estimate.sent_at, locale)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/estimates/${estimate.id}`} className="theme-btn-secondary rounded-xl px-3 py-2 text-xs font-semibold">
                    {labels.openEstimate}
                  </Link>
                  <Link href={`/customers/${estimate.customer_id}`} className="theme-btn-secondary rounded-xl px-3 py-2 text-xs font-semibold">
                    {labels.openCustomer}
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}

export default async function EstimatesPage({ searchParams }: EstimatesPageContext) {
  await requireServerRoles("/estimates", ["owner", "office_admin", "technician"]);
  const locale = await getLocale();
  const t = await getTranslations("estimatesPage");

  const resolvedSearchParams = await searchParams;
  const query = (firstValue(resolvedSearchParams.q) ?? "").trim();
  const statusValue = firstValue(resolvedSearchParams.status);
  const lifecycleValue = firstValue(resolvedSearchParams.lifecycleStatus);
  const status =
    statusValue === "draft" || statusValue === "sent" || statusValue === "approved" || statusValue === "rejected"
      ? statusValue
      : "";
  const lifecycleStatus =
    lifecycleValue === "draft" ||
    lifecycleValue === "sent" ||
    lifecycleValue === "approved" ||
    lifecycleValue === "void" ||
    lifecycleValue === "converted"
      ? lifecycleValue
      : "";
  const pipeline = parsePipeline((firstValue(resolvedSearchParams.pipeline) ?? "").trim().toLowerCase());
  const customerId = (firstValue(resolvedSearchParams.customerId) ?? "").trim();
  const jobId = (firstValue(resolvedSearchParams.jobId) ?? "").trim();
  const pageValue = Number.parseInt((firstValue(resolvedSearchParams.page) ?? "1").trim(), 10);
  const pageSizeValue = Number.parseInt((firstValue(resolvedSearchParams.pageSize) ?? "10").trim(), 10);
  const page = Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1;
  const pageSize = Number.isFinite(pageSizeValue) && [10, 25, 50, 100].includes(pageSizeValue) ? pageSizeValue : 10;

  const apiFilters = resolveApiFilters(pipeline, status, lifecycleStatus);
  const params = new URLSearchParams();

  if (query) {
    params.set("q", query);
  }
  if (apiFilters.status) {
    params.set("status", apiFilters.status);
  }
  if (apiFilters.lifecycleStatus) {
    params.set("lifecycleStatus", apiFilters.lifecycleStatus);
  }
  if (customerId) {
    params.set("customerId", customerId);
  }
  if (jobId) {
    params.set("jobId", jobId);
  }

  const endpoint = `/api/estimates${params.toString() ? `?${params.toString()}` : ""}`;

  let estimates: EstimateListItem[] = [];
  let loadError: string | null = null;

  try {
    const response = await serverApiFetch<EstimateListItem[]>(endpoint);
    estimates = Array.isArray(response) ? response : [];
    if (!Array.isArray(response)) {
      loadError = t("listUnavailable");
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : t("listUnavailable");
  }

  estimates = applyPipelineFilter(estimates, pipeline);

  const aiState = getEstimateAiReadyState();
  const metrics = deriveEstimateMetrics(estimates);
  const totalCount = estimates.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedEstimates = estimates.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function listQuery(overrides: Record<string, string | null | undefined> = {}) {
    return buildQueryString({
      q: query || null,
      pageSize: String(pageSize),
      customerId: customerId || null,
      jobId: jobId || null,
      pipeline: pipeline === "all" ? null : pipeline,
      status: pipeline === "all" ? status || null : null,
      lifecycleStatus: pipeline === "all" ? lifecycleStatus || null : null,
      ...overrides,
    });
  }

  const previousPageHref = listQuery({ page: currentPage > 1 ? String(currentPage - 1) : null });
  const nextPageHref = listQuery({ page: currentPage < totalPages ? String(currentPage + 1) : null });

  const tableState: MasterTableState = loadError
    ? { status: "error", message: t("listUnavailable") }
    : totalCount === 0
      ? { status: "empty", message: t("noEstimates") }
      : { status: "ready" };

  const pipelineFilters: Array<{ key: PipelineFilter; label: string }> = [
    { key: "all", label: t("segmentAll") },
    { key: "draft", label: t("segmentDraft") },
    { key: "sent", label: t("segmentSent") },
    { key: "approved", label: t("segmentApproved") },
    { key: "closed", label: t("segmentClosed") },
  ];

  const aiPanelLabels = {
    title: t("aiFollowUpAssistant"),
    readyTitle: t("aiReadyTitle"),
    readyBody: t("aiReadyBody"),
    noAutonomy: t("aiNoAutonomy"),
    standby: t("aiStandby"),
    queueTitle: t("statusFollowUpQueue"),
    queueHelper: t("statusFollowUpHelper"),
    openEstimate: t("openEstimate"),
    openCustomer: t("openCustomer"),
  };

  function renderEstimateTableRow(estimate: EstimateListItem) {
    const primaryStatus = getPrimaryEstimateStatus(estimate);
    const canOpenJob = isApprovedEstimate(estimate);

    return (
      <tr key={estimate.id} className="group border-b border-[color:var(--cmp-border-subtle)] transition hover:bg-[color:var(--cmp-surface-soft)]">
        <td className="py-4 pl-5 pr-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold text-[color:var(--sem-text-primary)]">{estimate.document_number}</p>
              <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">Sent {formatDate(estimate.sent_at, locale)}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-4">
          <p className="font-medium text-[color:var(--sem-text-primary)]">{estimate.customer_name}</p>
          <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">{estimate.job_title}</p>
        </td>
        <td className="px-4 py-4">
          <p className="max-w-[280px] text-sm leading-5 text-[color:var(--sem-text-secondary)]">{estimate.description || estimate.job_title}</p>
        </td>
        <td className="px-4 py-4">
          <p className="text-lg font-semibold tracking-tight text-[color:var(--sem-text-primary)]">{formatCurrency(estimate.price_cents, locale)}</p>
        </td>
        <td className="px-4 py-4">
          <div className="flex flex-wrap gap-2">
            <span className={primaryStatus.className}>{primaryStatus.label}</span>
            {shouldShowLifecycleBadge(estimate) ? (
              <span className={lifecycleBadgeClass(estimate.lifecycle_status)}>{formatLifecycleStatus(estimate.lifecycle_status)}</span>
            ) : null}
          </div>
        </td>
        <td className="px-4 py-4">
          <EstimateFollowUpSignal estimate={estimate} aiState={aiState} statusBasedLabel={t("statusBased")} locale={locale} />
        </td>
        <td className="py-4 pl-4 pr-5">
          <div className="flex items-center justify-end gap-2 opacity-85 transition group-hover:opacity-100">
            <Link
              href={`/estimates/${estimate.id}`}
              title={t("openEstimate")}
              aria-label={t("openEstimate")}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[color:var(--sem-text-secondary)] transition hover:border-[color:var(--cmp-border-accent)] hover:text-[color:var(--sem-accent-primary)]"
            >
              <FileText className="h-4 w-4" />
            </Link>
            {canOpenJob ? (
              <Link
                href={`/jobs/${estimate.job_id}`}
                title={t("openJob")}
                aria-label={t("openJob")}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--cmp-status-success-border)] bg-[color:var(--cmp-status-success-bg)] text-[color:var(--cmp-status-success-text)] transition hover:brightness-110"
              >
                <BriefcaseBusiness className="h-4 w-4" />
              </Link>
            ) : (
              <span
                title={t("openJob")}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 text-[color:var(--sem-text-muted)] opacity-60"
              >
                <BriefcaseBusiness className="h-4 w-4" />
              </span>
            )}
            <Link
              href={`/estimates/${estimate.id}`}
              className="flex h-9 items-center gap-2 rounded-xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] px-3 text-sm font-semibold text-[color:var(--sem-accent-primary)] transition hover:bg-[color:var(--cmp-surface-soft)]"
            >
              {t("openEstimate")}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </td>
      </tr>
    );
  }

  function renderEstimateMobileCard(estimate: EstimateListItem) {
    const primaryStatus = getPrimaryEstimateStatus(estimate);
    const canOpenJob = isApprovedEstimate(estimate);

    return (
      <article key={estimate.id} className="rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/80 p-4 shadow-[0_20px_60px_color-mix(in_srgb,var(--sem-board-glow)_22%,transparent)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-[color:var(--sem-text-muted)]">
              {estimate.document_number} · Sent {formatDate(estimate.sent_at, locale)}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-[color:var(--sem-text-primary)]">{estimate.customer_name}</h3>
            <p className="text-sm text-[color:var(--sem-text-secondary)]">{estimate.job_title}</p>
          </div>
          <span className={primaryStatus.className}>{primaryStatus.label}</span>
        </div>

        <p className="mt-4 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{estimate.description || estimate.job_title}</p>
        <p className="mt-3 text-2xl font-semibold tracking-tight text-[color:var(--sem-text-primary)]">{formatCurrency(estimate.price_cents, locale)}</p>

        <div className="mt-4">
          <EstimateFollowUpSignal estimate={estimate} aiState={aiState} statusBasedLabel={t("statusBased")} locale={locale} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Link href={`/estimates/${estimate.id}`} className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 px-3 py-2 text-center text-sm font-medium text-[color:var(--sem-text-secondary)]">
            {t("openEstimate")}
          </Link>
          <Link
            href={`/jobs/${estimate.job_id}`}
            className={cx(
              "rounded-2xl border px-3 py-2 text-center text-sm font-semibold",
              canOpenJob
                ? "border-[color:var(--cmp-status-success-border)] bg-[color:var(--cmp-status-success-bg)] text-[color:var(--cmp-status-success-text)]"
                : "pointer-events-none border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/30 text-[color:var(--sem-text-muted)] opacity-60",
            )}
          >
            {t("openJob")}
          </Link>
          <Link href={`/customers/${estimate.customer_id}`} className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 px-3 py-2 text-center text-sm font-medium text-[color:var(--sem-text-secondary)]">
            {t("openCustomer")}
          </Link>
        </div>
      </article>
    );
  }

  if (SHOW_LEGACY_ESTIMATES_INDEX) {
    return (
      <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
        <div className="relative mx-auto max-w-[88rem] px-6 py-14 lg:px-10">
          <section className="theme-surface-modal rounded-[40px] border border-[color:var(--cmp-border-subtle)] p-7">
            <h1 className="font-[family:var(--font-flat-display)] text-4xl tracking-tight">Estimate List</h1>
            <form className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px_220px_160px_auto]" method="get">
              {customerId ? <input type="hidden" name="customerId" value={customerId} /> : null}
              {jobId ? <input type="hidden" name="jobId" value={jobId} /> : null}
              <input type="hidden" name="page" value="1" />
              <input name="q" defaultValue={query} placeholder="Customer or job" className="theme-input-control rounded-[18px] px-4 py-3 text-sm" />
              <select name="status" defaultValue={status} className="theme-input-control rounded-[18px] px-4 py-3 text-sm">
                <option value="">All</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              <select name="lifecycleStatus" defaultValue={lifecycleStatus} className="theme-input-control rounded-[18px] px-4 py-3 text-sm">
                <option value="">All</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="approved">Approved</option>
                <option value="void">Voided</option>
              </select>
              <select name="pageSize" defaultValue={String(pageSize)} className="theme-input-control rounded-[18px] px-4 py-3 text-sm">
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
              <button type="submit" className="theme-btn-secondary rounded-[18px] px-5 py-3 text-sm">{t("applyFilters")}</button>
            </form>
            {loadError ? <div className="theme-alert-error mt-6 rounded-[22px] border px-5 py-4 text-sm">{loadError}</div> : null}
            <div className="mt-6">
              <MasterTable
                columns={[
                  { key: "actions", label: "Actions", align: "center" },
                  { key: "customer", label: "Customer Name", align: "center" },
                  { key: "estimate", label: "Estimate #", align: "center" },
                  { key: "status", label: "Status", align: "center" },
                  { key: "total", label: "Total", align: "center" },
                  { key: "sent", label: "Sent", align: "center" },
                ]}
                colSpan={6}
                state={tableState}
              >
                {pagedEstimates.map((estimate) => (
                  <MasterTableRow key={estimate.id}>
                    <td className="master-table-cell master-table-actions-cell align-middle">
                      <div className="inline-flex items-center justify-center gap-2">
                        <Link href={`/estimates/${estimate.id}`} className={estimateOpenIconClass}><FileText className="h-[0.9rem] w-[0.9rem]" /></Link>
                        <Link href={`/customers/${estimate.customer_id}`} className={estimateCustomerIconClass}><UserRound className="h-[0.9rem] w-[0.9rem]" /></Link>
                        <Link href={`/jobs/${estimate.job_id}`} className={estimateJobIconClass}><Briefcase className="h-[0.9rem] w-[0.9rem]" /></Link>
                      </div>
                    </td>
                    <td className="master-table-cell text-center">{estimate.customer_name}</td>
                    <td className="master-table-cell text-center">{estimate.document_number}</td>
                    <td className="master-table-cell text-center"><span className={getPrimaryEstimateStatus(estimate).className}>{getPrimaryEstimateStatus(estimate).label}</span></td>
                    <td className="master-table-cell text-center">{formatCurrency(estimate.price_cents, locale)}</td>
                    <td className="master-table-cell text-center">{formatDate(estimate.sent_at, locale)}</td>
                  </MasterTableRow>
                ))}
              </MasterTable>
            </div>
            <div className="mt-6">
              <MasterTablePagination page={currentPage} pageSize={pageSize} totalCount={totalCount} totalPages={totalPages} previousHref={previousPageHref} nextHref={nextPageHref} />
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <BoardShell gridOpacity="subtle">
      <div className="mx-auto max-w-[1500px] px-5 py-6 lg:px-8">
        <header className="rounded-[34px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]">
                  <FileText className="h-5 w-5" />
                </span>
                <p className="text-xs uppercase tracking-[0.34em] text-[color:var(--sem-accent-primary)]">{t("revenueDesk")}</p>
              </div>
              <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)] md:text-5xl">
                {t("title")}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--sem-text-secondary)]">{t("description")}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="#estimate-ai-assistant"
                className="flex items-center gap-2 rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] px-4 py-3 text-sm font-semibold text-[color:var(--sem-accent-primary)] shadow-[0_0_35px_color-mix(in_srgb,var(--sem-accent-primary)_14%,transparent)] transition hover:bg-[color:var(--cmp-surface-soft)]"
              >
                <Sparkles className="h-4 w-4" />
                {t("aiFollowUpAssistant")}
              </Link>
              <Link href="/estimates/new" className="theme-btn-primary flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
                <Plus className="h-4 w-4" />
                {t("newEstimate")}
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile icon={CircleDollarSign} label={t("totalPipelineValue")} value={formatCurrency(metrics.totalPipelineCents, locale)} helper={t("totalPipelineHelper")} />
          <MetricTile icon={FileClock} label={t("pendingApproval")} value={`${metrics.pendingCount} · ${formatCurrency(metrics.pendingValueCents, locale)}`} helper={t("pendingApprovalHelper")} />
          <MetricTile icon={CheckCircle2} label={t("approvedValue")} value={formatCurrency(metrics.approvedValueCents, locale)} helper={t("approvedValueHelper")} />
          <MetricTile icon={BriefcaseBusiness} label={t("approvedThisMonth")} value={formatCurrency(metrics.approvedThisMonthCents, locale)} helper={t("approvedThisMonthHelper")} />
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <section className="rounded-[34px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)] backdrop-blur-xl">
            <div className="flex flex-col gap-4 border-b border-[color:var(--cmp-border-subtle)] pb-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--sem-text-muted)]">{t("pipelineCommandBar")}</p>
                <h2 className="mt-2 font-[family:var(--font-flat-display)] text-2xl tracking-tight text-[color:var(--sem-display-headline)]">{t("pipelineControlCenter")}</h2>
              </div>

              <form className="flex min-w-0 flex-1 flex-col gap-3 xl:max-w-2xl xl:flex-row" method="GET">
                {customerId ? <input type="hidden" name="customerId" value={customerId} /> : null}
                {jobId ? <input type="hidden" name="jobId" value={jobId} /> : null}
                {pipeline !== "all" ? <input type="hidden" name="pipeline" value={pipeline} /> : null}
                {pipeline === "all" && status ? <input type="hidden" name="status" value={status} /> : null}
                {pipeline === "all" && lifecycleStatus ? <input type="hidden" name="lifecycleStatus" value={lifecycleStatus} /> : null}
                <label className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 px-4 py-3 text-sm">
                  <Search className="h-4 w-4 shrink-0 text-[color:var(--sem-text-muted)]" />
                  <input
                    name="q"
                    defaultValue={query}
                    placeholder={t("searchPlaceholder")}
                    className="min-w-0 flex-1 bg-transparent text-[color:var(--sem-text-primary)] outline-none placeholder:text-[color:var(--sem-text-muted)]"
                  />
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 px-4 py-3 text-sm">
                  <span className="shrink-0 text-[color:var(--sem-text-muted)]">{t("pageSize")}</span>
                  <select name="pageSize" defaultValue={String(pageSize)} className="bg-transparent text-[color:var(--sem-text-primary)] outline-none">
                    {[10, 25, 50, 100].map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="theme-btn-primary rounded-2xl px-4 py-3 text-sm font-semibold">{t("applyFilters")}</button>
              </form>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {pipelineFilters.map((filter) => (
                <Link
                  key={filter.key}
                  href={listQuery({ pipeline: filter.key === "all" ? null : filter.key, page: null, status: null, lifecycleStatus: null })}
                  className={cx(
                    "rounded-full border px-4 py-2 text-sm font-medium transition",
                    pipeline === filter.key
                      ? "border-[color:var(--sem-accent-primary)] bg-[color:var(--cmp-selected-surface)] text-[color:var(--sem-accent-primary)] shadow-[0_0_24px_color-mix(in_srgb,var(--sem-accent-primary)_15%,transparent)]"
                      : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[color:var(--sem-text-secondary)] hover:bg-[color:var(--cmp-surface-soft)] hover:text-[color:var(--sem-text-primary)]",
                  )}
                >
                  {filter.label}
                </Link>
              ))}
            </div>

            {loadError ? <div className="theme-alert-error mt-6 rounded-[20px] border px-4 py-3 text-sm">{loadError}</div> : null}

            {totalCount > 0 ? (
              <>
                <div className="mt-6 hidden overflow-hidden rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/30 2xl:block">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="border-b border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">
                      <tr>
                        <th className="py-4 pl-5 pr-4 font-medium">Estimate</th>
                        <th className="px-4 py-4 font-medium">Customer</th>
                        <th className="px-4 py-4 font-medium">{t("jobScope")}</th>
                        <th className="px-4 py-4 font-medium">Total</th>
                        <th className="px-4 py-4 font-medium">Status</th>
                        <th className="px-4 py-4 font-medium">{t("followUpSignal")}</th>
                        <th className="py-4 pl-4 pr-5 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>{pagedEstimates.map((estimate) => renderEstimateTableRow(estimate))}</tbody>
                  </table>
                </div>

                <div className="mt-6 grid gap-4 2xl:hidden">
                  <MasterMobileList items={pagedEstimates} emptyState={t("noEstimates")} renderItem={renderEstimateMobileCard} />
                </div>
              </>
            ) : loadError ? null : (
              <div className="theme-surface-card mt-6 rounded-[28px] border border-dashed border-[color:var(--cmp-border-subtle)] px-6 py-10 text-center text-sm text-[color:var(--sem-text-secondary)]">
                {t("noEstimates")}
              </div>
            )}

            <div className="mt-5 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/40 px-4 py-3">
              <MasterTablePagination
                page={currentPage}
                pageSize={pageSize}
                totalCount={totalCount}
                totalPages={totalPages}
                previousHref={previousPageHref}
                nextHref={nextPageHref}
              />
            </div>
          </section>

          <AiFollowUpAssistantPanel estimates={estimates} aiState={aiState} locale={locale} labels={aiPanelLabels} />
        </div>
      </div>
    </BoardShell>
  );
}
