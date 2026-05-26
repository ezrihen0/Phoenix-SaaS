"use client";

import Link from "next/link";
import { ArrowLeft, ClipboardCheck } from "lucide-react";

import type { InspectionWorkspacePayload } from "@/lib/inspections/browser-api";

import { InspectionChecklistRow, type StructuredRecommendationDraft } from "./inspection-checklist-row";
import { formatSectionLabel, jurisdictionLabel, MetricCard, reportTypeLabel, StatusPill, workflowTypeLabel } from "./inspection-labels";
import { InspectionReportConfidencePanel } from "./inspection-report-confidence-panel";
import { InspectionSectionRail } from "./inspection-section-rail";

type LiveScoreOrCompliance = {
  score: number | null;
  score_max: number;
  compliance_status: string | null;
  can_generate: boolean;
  gate_errors: string[];
};

type InspectionWorkspaceDeskProps = {
  workspace: InspectionWorkspacePayload;
  localItems: InspectionWorkspacePayload["items"];
  filteredItems: InspectionWorkspacePayload["items"];
  activeSectionKey: string | "all" | null;
  recommendationDrafts: Record<string, StructuredRecommendationDraft>;
  liveClientScoreOrCompliance: LiveScoreOrCompliance;
  missingWettFieldsCount: number;
  gasLicenseNumber: string;
  gasLicenseHolderName: string;
  gasLicenseMissing: boolean;
  generateDisabled: boolean;
  generateDisabledTooltip?: string;
  sendDisabled: boolean;
  sendDisabledReason: string | null;
  sendFeedback: { type: "success" | "error"; message: string } | null;
  busy: string | null;
  generatedPdfUrl: string | null;
  canManage: boolean;
  sessionRole: string | null;
  onSelectSection: (sectionKey: string | "all") => void;
  onStatusChange: (itemId: string, status: "satisfactory" | "unsatisfactory" | "na") => void;
  onOpenPhotoPicker: (itemId: string, source: "camera" | "library") => void;
  onUpdateRecommendationDraft: (item: InspectionWorkspacePayload["items"][number], patch: Partial<StructuredRecommendationDraft>, shouldCommit?: boolean) => void;
  onCommitRecommendationDraft: (item: InspectionWorkspacePayload["items"][number]) => void;
  onRecommendationBlur: (itemId: string, value: string | null) => void;
  onGasLicenseNumberChange: (value: string) => void;
  onGasLicenseHolderNameChange: (value: string) => void;
  onSaveGasLicense: () => void;
  onGenerate: () => void;
  onMarkSentAndLock: () => void;
  onUnlock: () => void;
  onExpandPreview: () => void;
  onOpenPdf: () => void;
  onDownloadPdf: () => void;
  onRequiredFieldBlur: (fieldId: string, value: string) => void;
};

export function InspectionWorkspaceDesk(props: InspectionWorkspaceDeskProps) {
  const meta = props.workspace.inspectionMeta;
  const isStandardWorkflow = meta.workflow_type === "safety_standard";
  const photoButtonsDisabled = Boolean(props.busy) || Boolean(meta.locked_at) || !props.canManage;
  const itemButtonsDisabled = Boolean(props.busy) || Boolean(meta.locked_at) || !props.canManage;

  const stats = {
    total: props.localItems.length,
    sat: props.localItems.filter((item) => item.status === "satisfactory").length,
    unsat: props.localItems.filter((item) => item.status === "unsatisfactory").length,
    na: props.localItems.filter((item) => item.status === "na").length,
  };

  return (
    <div className="min-h-screen bg-zinc-50 pb-8 text-zinc-950">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 px-6 py-4 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-[96rem] flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link href="/inspections" className="mb-3 inline-flex items-center gap-2 text-xs font-medium text-zinc-500 hover:text-zinc-800">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to library
            </Link>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-zinc-950 p-1.5 text-white"><ClipboardCheck className="h-4 w-4" /></span>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-400">Report Confidence Desk</p>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-950">{meta.client_display_name_snapshot ?? "Inspection workspace"}</h1>
            <p className="mt-1 text-sm text-zinc-600">{meta.site_address_snapshot ?? "No address snapshot"}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 font-mono text-xs text-zinc-600">{reportTypeLabel(meta.report_type)}</span>
              <span className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 font-mono text-xs text-zinc-600">{workflowTypeLabel(meta.workflow_type)}</span>
              <span className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 font-mono text-xs text-zinc-600">{jurisdictionLabel(meta.province_code, meta.country_code)}</span>
              <StatusPill status={meta.status} />
              {meta.generated_pdf_at ? <StatusPill status="generated" /> : null}
              {meta.sent_to_customer_at ? <StatusPill status="sent" /> : null}
              {meta.locked_at ? <StatusPill status="locked" /> : null}
            </div>
            {meta.public_job_code ? (
              <div className="mt-3 flex flex-wrap gap-3 font-mono text-[10px] text-zinc-500">
                <span>Job {meta.public_job_code}</span>
                {meta.quote_number ? <span>Quote {meta.quote_number}</span> : null}
                {meta.invoice_number ? <span>Invoice {meta.invoice_number}</span> : null}
                {meta.report_number ? <span>Report {meta.report_number}</span> : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {!props.canManage ? (
        <div className="mx-auto max-w-[96rem] px-6 pt-4">
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Read-only view{props.sessionRole ? ` (${props.sessionRole})` : ""}. Changes require inspections.admin permission.
          </p>
        </div>
      ) : null}

      <div className="mx-auto mt-6 grid max-w-[96rem] gap-5 px-6 xl:grid-cols-[320px_minmax(0,1fr)_390px]">
        <InspectionSectionRail
          sections={props.workspace.sections}
          activeSectionKey={props.activeSectionKey}
          onSelectSection={props.onSelectSection}
        />

        <div className="space-y-5">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Evaluated" value={`${stats.sat + stats.unsat + stats.na}/${stats.total}`} note="Current workspace" />
            <MetricCard label="Satisfactory" value={stats.sat} note="Marked SAT" tone="emerald" />
            <MetricCard label="Unsatisfactory" value={stats.unsat} note="Report findings" tone="rose" />
            <MetricCard label="N/A" value={stats.na} note="Not applicable" />
            <MetricCard label="Gate issues" value={props.liveClientScoreOrCompliance.gate_errors.length} note="Generate blockers" tone="amber" />
          </section>

          <section className="overflow-hidden rounded-[24px] border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">Field testing grid</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">
                {props.activeSectionKey === "all" ? "All checklist items" : formatSectionLabel(props.activeSectionKey ?? "")}
              </h2>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">Tap to evaluate · changes map to PATCH item status</p>
            </div>
            <div className="divide-y divide-zinc-200">
              {props.filteredItems.length ? (
                props.filteredItems.map((item) => (
                  <InspectionChecklistRow
                    key={item.id}
                    item={item}
                    isStandardWorkflow={isStandardWorkflow}
                    recommendationDraft={props.recommendationDrafts[item.id] ?? { issueObserved: "", riskIfIgnored: "", recommendedAction: "", priorityLevel: "P2" }}
                    photoButtonsDisabled={photoButtonsDisabled}
                    itemButtonsDisabled={itemButtonsDisabled}
                    onStatusChange={props.onStatusChange}
                    onOpenPhotoPicker={props.onOpenPhotoPicker}
                    onUpdateRecommendationDraft={props.onUpdateRecommendationDraft}
                    onCommitRecommendationDraft={props.onCommitRecommendationDraft}
                    onRecommendationBlur={props.onRecommendationBlur}
                  />
                ))
              ) : (
                <p className="p-6 text-sm text-zinc-500">No checklist items in this section.</p>
              )}
            </div>
          </section>
        </div>

        <InspectionReportConfidencePanel
          workspace={props.workspace}
          liveClientScoreOrCompliance={props.liveClientScoreOrCompliance}
          missingWettFieldsCount={props.missingWettFieldsCount}
          gasLicenseNumber={props.gasLicenseNumber}
          gasLicenseHolderName={props.gasLicenseHolderName}
          gasLicenseMissing={props.gasLicenseMissing}
          generateDisabled={props.generateDisabled || !props.canManage}
          generateDisabledTooltip={props.generateDisabledTooltip}
          sendDisabled={props.sendDisabled || !props.canManage}
          sendDisabledReason={props.sendDisabledReason}
          sendFeedback={props.sendFeedback}
          busy={props.busy}
          generatedPdfUrl={props.generatedPdfUrl}
          canManage={props.canManage}
          onGasLicenseNumberChange={props.onGasLicenseNumberChange}
          onGasLicenseHolderNameChange={props.onGasLicenseHolderNameChange}
          onSaveGasLicense={props.onSaveGasLicense}
          onGenerate={props.onGenerate}
          onMarkSentAndLock={props.onMarkSentAndLock}
          onUnlock={props.onUnlock}
          onExpandPreview={props.onExpandPreview}
          onOpenPdf={props.onOpenPdf}
          onDownloadPdf={props.onDownloadPdf}
          onRequiredFieldBlur={props.onRequiredFieldBlur}
        />
      </div>
    </div>
  );
}
