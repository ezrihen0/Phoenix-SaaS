"use client";

import {
  CheckCircle2,
  FileCheck2,
  FileText,
  Gauge,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  XCircle,
} from "lucide-react";

import type { InspectionWorkspacePayload } from "@/lib/inspections/browser-api";

import { inspectionStatusLabel, workflowTypeLabel } from "./inspection-labels";
import { inspectionPanelClass, inspectionPanelHeaderClass } from "./inspection-command-shell";

type InspectionReportConfidencePanelProps = {
  workspace: InspectionWorkspacePayload;
  liveClientScoreOrCompliance: {
    score: number | null;
    score_max: number;
    compliance_status: string | null;
    can_generate: boolean;
    gate_errors: string[];
  };
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

export function InspectionReportConfidencePanel({
  workspace,
  liveClientScoreOrCompliance,
  missingWettFieldsCount,
  gasLicenseNumber,
  gasLicenseHolderName,
  gasLicenseMissing,
  generateDisabled,
  generateDisabledTooltip,
  sendDisabled,
  sendDisabledReason,
  sendFeedback,
  busy,
  generatedPdfUrl,
  canManage,
  onGasLicenseNumberChange,
  onGasLicenseHolderNameChange,
  onSaveGasLicense,
  onGenerate,
  onMarkSentAndLock,
  onUnlock,
  onExpandPreview,
  onOpenPdf,
  onDownloadPdf,
  onRequiredFieldBlur,
}: InspectionReportConfidencePanelProps) {
  const locked = Boolean(workspace.inspectionMeta.locked_at);
  const generated = Boolean(workspace.inspectionMeta.generated_pdf_at || workspace.inspectionMeta.generated_pdf_url);
  const workflow = workspace.inspectionMeta.workflow_type;

  return (
    <aside className="space-y-4 overflow-auto">
      <section className={inspectionPanelClass()}>
        <div className={inspectionPanelHeaderClass()}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]">
                <Gauge className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Command surface</p>
                <h2 className="text-sm font-bold uppercase tracking-wider text-[color:var(--sem-text-primary)]">Report confidence</h2>
              </div>
            </div>
            {locked ? <Lock className="h-4 w-4 text-[color:var(--sem-text-muted)]" /> : <Unlock className="h-4 w-4 text-[color:var(--sem-text-muted)]" />}
          </div>
        </div>

        <div className="space-y-3 p-5">
          <div className="theme-control-surface rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Workflow</p>
            <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">{workflowTypeLabel(workflow)}</p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--sem-text-secondary)]">No fake certification or delivery claims. The report follows the real server gate.</p>
          </div>

          {workspace.inspectionMeta.is_internal_draft ? (
            <p className="theme-alert-warning rounded-xl border px-3 py-2 text-xs">
              {workspace.inspectionMeta.draft_action_label}
            </p>
          ) : null}

          {workflow === "compliance_wett" ? (
            <div className="theme-control-surface rounded-2xl p-4 text-sm">
              <p className="font-semibold text-[color:var(--sem-text-primary)]">
                {inspectionStatusLabel(liveClientScoreOrCompliance.compliance_status ?? workspace.liveScoreOrCompliance.compliance_status)}
              </p>
              <p className={`mt-1 text-xs ${missingWettFieldsCount > 0 ? "text-[color:var(--cmp-status-error-text)]" : "text-[color:var(--cmp-status-success-text)]"}`}>
                {missingWettFieldsCount > 0
                  ? `${missingWettFieldsCount} mandatory legal field(s) missing`
                  : "All mandatory legal fields completed"}
              </p>
            </div>
          ) : (
            <p className="theme-control-surface rounded-2xl p-4 text-sm text-[color:var(--sem-text-primary)]">
              Safety Score: {liveClientScoreOrCompliance.score ?? 0}/{liveClientScoreOrCompliance.score_max ?? 100}
            </p>
          )}

          {liveClientScoreOrCompliance.can_generate ? (
            <div className="theme-alert-success rounded-2xl border p-4">
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /><p className="text-sm font-semibold">Ready to generate PDF</p></div>
            </div>
          ) : null}

          {workflow === "gas_simplified" ? (
            <div className="theme-control-surface space-y-2 rounded-2xl p-4">
              <p className="text-xs text-[color:var(--sem-text-secondary)]">Provincial Gas License</p>
              <input className="theme-input-control w-full rounded-xl px-2 py-2 text-xs" placeholder="License Number" value={gasLicenseNumber} disabled={!canManage || locked} onChange={(e) => onGasLicenseNumberChange(e.target.value)} />
              <input className="theme-input-control w-full rounded-xl px-2 py-2 text-xs" placeholder="License Holder Name" value={gasLicenseHolderName} disabled={!canManage || locked} onChange={(e) => onGasLicenseHolderNameChange(e.target.value)} />
              {canManage ? (
                <button type="button" className="theme-btn-secondary w-full rounded-xl px-2 py-2 text-xs font-medium disabled:opacity-50" disabled={locked || Boolean(busy)} onClick={onSaveGasLicense}>
                  Save gas license
                </button>
              ) : null}
              {gasLicenseMissing ? (
                <p className="text-[11px] text-[color:var(--cmp-status-error-text)]">License number and holder are required before Generate/Mark sent.</p>
              ) : (
                <p className="text-[11px] text-[color:var(--cmp-status-success-text)]">Gas license information is complete.</p>
              )}
            </div>
          ) : null}

          {canManage ? (
            <div className="grid gap-2 border-t border-[color:var(--cmp-border-subtle)] pt-4">
              <span className="group relative w-full" title={generateDisabledTooltip}>
                <button
                  type="button"
                  className="theme-btn-primary inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold disabled:opacity-40"
                  disabled={generateDisabled}
                  onClick={onGenerate}
                >
                  <FileCheck2 className="h-4 w-4" />
                  {busy === "generate" ? "Generating PDF..." : "Generate PDF"}
                </button>
              </span>
              <button type="button" className="theme-btn-secondary inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold disabled:opacity-40" disabled={!generated} onClick={onOpenPdf}>
                <FileText className="h-4 w-4" /> Preview / Open PDF
              </button>
              <button type="button" className="theme-btn-secondary inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold disabled:opacity-40" disabled={!generated} onClick={onDownloadPdf}>
                <FileText className="h-4 w-4" /> Download PDF
              </button>
              <button type="button" className="theme-alert-warning inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold disabled:opacity-40" disabled={sendDisabled} onClick={onMarkSentAndLock}>
                <Lock className="h-4 w-4" />
                {busy === "send" ? "Marking sent..." : "Mark sent & lock record"}
              </button>
              {workspace.inspectionMeta.locked_at ? (
                <button type="button" className="theme-btn-secondary inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold disabled:opacity-40" disabled={Boolean(busy)} onClick={onUnlock}>
                  Unlock for correction
                </button>
              ) : null}
            </div>
          ) : null}

          <p className="theme-control-surface rounded-xl px-3 py-2 text-[11px] leading-5 text-[color:var(--sem-text-secondary)]">
            Marking a report as sent locks the record. It does not send email or SMS unless a delivery integration exists.
          </p>

          {sendFeedback ? (
            <p className={`rounded-xl px-3 py-2 text-xs ${sendFeedback.type === "success" ? "theme-alert-success border" : "theme-alert-error border"}`}>
              {sendFeedback.message}
            </p>
          ) : sendDisabledReason ? (
            <p className="theme-control-surface rounded-xl px-3 py-2 text-xs text-[color:var(--sem-text-secondary)]">{sendDisabledReason}</p>
          ) : null}
        </div>
      </section>

      {workspace.required_fields.length ? (
        <section className={inspectionPanelClass()}>
          <div className={inspectionPanelHeaderClass()}>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[color:var(--sem-text-muted)]" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--sem-text-secondary)]">Required fields</h2>
            </div>
          </div>
          <div className="space-y-2 p-5">
            {workspace.required_fields.map((field) => (
              <div key={field.id} className="theme-control-surface rounded-xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[color:var(--sem-text-primary)]">{field.field_label}{field.is_mandatory ? " *" : ""}</p>
                  {field.is_satisfied ? <CheckCircle2 className="h-4 w-4 text-[color:var(--cmp-status-success-text)]" /> : <XCircle className="h-4 w-4 text-[color:var(--cmp-status-error-text)]" />}
                </div>
                <p className="mt-1 font-mono text-[10px] text-[color:var(--sem-text-muted)]">{field.field_key}</p>
                <input
                  className={`theme-input-control mt-2 w-full rounded-xl px-2 py-2 text-xs ${field.is_mandatory && !field.is_satisfied ? "border-[color:var(--cmp-status-error-border)]" : ""}`}
                  defaultValue={field.field_value ?? ""}
                  readOnly={!canManage || locked}
                  onBlur={(event) => {
                    if (canManage && !locked) {
                      onRequiredFieldBlur(field.id, event.target.value);
                    }
                  }}
                />
                {field.is_mandatory && !field.is_satisfied ? (
                  <p className="mt-1 text-[11px] text-[color:var(--cmp-status-error-text)]">Required before Generate/Mark sent.</p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className={inspectionPanelClass()}>
        <div className={inspectionPanelHeaderClass()}>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-[color:var(--sem-text-muted)]" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--sem-text-secondary)]">Scope & limitations</h2>
          </div>
        </div>
        <div className="space-y-3 p-5 text-xs leading-5 text-[color:var(--sem-text-secondary)]">
          <p>{workspace.disclaimers.main}</p>
          {workspace.disclaimers.limitations ? <p>{workspace.disclaimers.limitations}</p> : null}
          {workspace.disclaimers.workflowSpecific ? (
            <p className="theme-control-surface rounded-xl p-3">{workspace.disclaimers.workflowSpecific}</p>
          ) : null}
        </div>
      </section>

      {workspace.photoPool.length ? (
        <section className={inspectionPanelClass()}>
          <div className={inspectionPanelHeaderClass()}>
            <p className="text-xs font-bold uppercase tracking-wider text-[color:var(--sem-text-secondary)]">Photo evidence</p>
          </div>
          <div className="space-y-2 p-5">
            {workspace.photoPool.map((photo) => (
              <div key={photo.id} className="theme-control-surface rounded-xl p-3 text-xs">
                <p className="font-semibold text-[color:var(--sem-text-primary)]">{photo.assignment_label ?? photo.caption ?? "Uploaded photo"}</p>
                <p className="mt-1 font-mono text-[10px] text-[color:var(--sem-text-muted)]">{photo.assignment_type ?? photo.photo_type}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className={inspectionPanelClass()}>
        <div className={`${inspectionPanelHeaderClass()} flex flex-wrap items-center justify-between gap-2`}>
          <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">PDF Preview</p>
          <button type="button" className="theme-btn-ghost rounded-lg px-2 py-1 text-xs disabled:opacity-40" disabled={!generatedPdfUrl} onClick={onExpandPreview}>
            Expand
          </button>
        </div>
        <div className="p-4">
          {generatedPdfUrl ? (
            <iframe title="pdf-preview" src={generatedPdfUrl} className="h-[320px] w-full rounded-xl border border-[color:var(--cmp-border-subtle)]" />
          ) : (
            <p className="text-xs text-[color:var(--sem-text-secondary)]">Generate report to preview PDF.</p>
          )}
        </div>
      </section>
    </aside>
  );
}
