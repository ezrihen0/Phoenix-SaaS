"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, MinusCircle, ShieldAlert } from "lucide-react";

import { MetricTile } from "@/components/board/metric-tile";
import type { InspectionWorkspacePayload } from "@/lib/inspections/browser-api";

import { InspectionChecklistRow, type StructuredRecommendationDraft } from "./inspection-checklist-row";
import {
  InspectionCommandHeader,
  InspectionCommandShell,
  inspectionBadgeClass,
  inspectionOpsZoneClass,
  inspectionPanelClass,
  inspectionPanelHeaderClass,
} from "./inspection-command-shell";
import { formatSectionLabel, jurisdictionLabel, reportTypeLabel, StatusPill, workflowTypeLabel } from "./inspection-labels";
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
  error?: string | null;
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
    <InspectionCommandShell>
      <InspectionCommandHeader
        sticky
        eyebrow="Report Confidence Desk"
        title={meta.client_display_name_snapshot ?? "Inspection workspace"}
        subtitle={meta.site_address_snapshot ?? "No address snapshot"}
        icon={<ClipboardCheck className="h-5 w-5" />}
        backLink={(
          <Link href="/inspections" className="inline-flex items-center gap-2 text-xs font-medium text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-text-primary)]">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to library
          </Link>
        )}
        badges={(
          <>
            <span className={inspectionBadgeClass()}>{reportTypeLabel(meta.report_type)}</span>
            <span className={inspectionBadgeClass()}>{workflowTypeLabel(meta.workflow_type)}</span>
            <span className={inspectionBadgeClass()}>{jurisdictionLabel(meta.province_code, meta.country_code)}</span>
            <StatusPill status={meta.status} />
            {meta.generated_pdf_at ? <StatusPill status="generated" /> : null}
            {meta.sent_to_customer_at ? <StatusPill status="sent" /> : null}
            {meta.locked_at ? <StatusPill status="locked" /> : null}
            {meta.public_job_code ? (
              <span className="font-mono text-[10px] text-[color:var(--sem-text-muted)]">
                Job {meta.public_job_code}
                {meta.quote_number ? ` · Quote ${meta.quote_number}` : ""}
                {meta.invoice_number ? ` · Invoice ${meta.invoice_number}` : ""}
                {meta.report_number ? ` · Report ${meta.report_number}` : ""}
              </span>
            ) : null}
          </>
        )}
      />

      <div className={inspectionOpsZoneClass()}>
        <div className="mx-auto w-full max-w-[1320px] space-y-5">
          {props.error ? <p className="theme-alert-error rounded-[20px] border px-4 py-3 text-sm">{props.error}</p> : null}

          {!props.canManage ? (
            <p className="theme-alert-warning rounded-[20px] border px-4 py-3 text-sm">
              Read-only view{props.sessionRole ? ` (${props.sessionRole})` : ""}. Changes require inspections.admin permission.
            </p>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_360px] xl:items-start xl:justify-center">
          <InspectionSectionRail
            sections={props.workspace.sections}
            activeSectionKey={props.activeSectionKey}
            onSelectSection={props.onSelectSection}
          />

          <div className="space-y-5">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricTile icon={ClipboardCheck} label="Evaluated" value={`${stats.sat + stats.unsat + stats.na}/${stats.total}`} helper="Checklist items evaluated" />
              <MetricTile icon={CheckCircle2} label="Satisfactory" value={stats.sat} helper="Marked satisfactory" />
              <MetricTile icon={AlertTriangle} label="Unsatisfactory" value={stats.unsat} helper="Report findings recorded" />
              <MetricTile icon={MinusCircle} label="N/A" value={stats.na} helper="Marked not applicable" />
              <MetricTile icon={ShieldAlert} label="Gate issues" value={props.liveClientScoreOrCompliance.gate_errors.length} helper="Blocked by report gates" />
            </section>

            <section className={`overflow-hidden ${inspectionPanelClass()}`}>
              <div className={inspectionPanelHeaderClass()}>
                <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Field testing grid</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-[color:var(--sem-text-primary)]">
                  {props.activeSectionKey === "all" ? "All checklist items" : formatSectionLabel(props.activeSectionKey ?? "")}
                </h2>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">Tap to evaluate · changes map to PATCH item status</p>
              </div>
              <div className="divide-y divide-[color:var(--cmp-border-subtle)]">
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
                  <p className="p-6 text-sm text-[color:var(--sem-text-secondary)]">No checklist items in this section.</p>
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
      </div>
    </InspectionCommandShell>
  );
}
