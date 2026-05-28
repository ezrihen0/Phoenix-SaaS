"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, ExternalLink, Loader2, Save } from "lucide-react";

import {
  generateInspection,
  getInspectionWorkspace,
  patchInspectionItem,
  patchInspectionMeta,
  patchRequiredField,
  sendInspection,
  type InspectionWorkspacePayload,
} from "@/lib/inspections/browser-api";
import { formatSectionLabel } from "@/components/inspections/inspection-labels";

const reportTypeLabels: Record<string, string> = {
  wood_burning_fireplace: "Standard",
  wood_stove: "Wood Stove",
  wett_inspection: "WETT Site Basic",
  gas_fireplace: "Gas Fireplace",
  garage_door: "Garage Door",
  hvac: "HVAC",
};

const cardClass = "rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]";
const labelClass = "text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]";

export default function MobileWorkspaceClient({
  inspectionId,
  canManage,
}: {
  inspectionId: string;
  canManage: boolean;
}) {
  const [workspace, setWorkspace] = useState<InspectionWorkspacePayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // Local item edits
  const [itemEdits, setItemEdits] = useState<Record<string, { status?: string; text?: string }>>({});
  const [fieldEdits, setFieldEdits] = useState<Record<string, string>>({});
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [savingFieldId, setSavingFieldId] = useState<string | null>(null);

  // Actions state
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Gas license (gas_fireplace only)
  const [gasLicenseNumber, setGasLicenseNumber] = useState("");
  const [gasLicenseHolder, setGasLicenseHolder] = useState("");
  const [savingGasMeta, setSavingGasMeta] = useState(false);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const data = await getInspectionWorkspace(inspectionId);
      setWorkspace(data);
      // Init field edits from workspace
      const fields: Record<string, string> = {};
      for (const f of data.required_fields) {
        fields[f.id] = f.field_value ?? "";
      }
      setFieldEdits(fields);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load inspection.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionId]);

  useEffect(() => {
    if (workspace?.inspectionMeta) {
      setGasLicenseNumber(workspace.inspectionMeta.gas_license_number ?? "");
      setGasLicenseHolder(workspace.inspectionMeta.gas_license_holder_name ?? "");
    }
  }, [workspace?.inspectionMeta.gas_license_number, workspace?.inspectionMeta.gas_license_holder_name]);

  // Group items by section
  const sectionGroups = useMemo(() => {
    if (!workspace) return [];
    const map = new Map<string, InspectionWorkspacePayload["items"]>();
    for (const item of workspace.items) {
      const list = map.get(item.section_key) ?? [];
      list.push(item);
      map.set(item.section_key, list);
    }
    return workspace.sections.map((s) => ({
      ...s,
      items: (map.get(s.key) ?? []).sort((a, b) => a.sort_order - b.sort_order),
    }));
  }, [workspace]);

  function getItemStatus(itemId: string, current: string) {
    return itemEdits[itemId]?.status ?? current;
  }

  function getItemText(itemId: string, current: string | null) {
    return itemEdits[itemId]?.text ?? current ?? "";
  }

  async function saveItem(itemId: string) {
    const edit = itemEdits[itemId];
    if (!edit) return;

    setSavingItemId(itemId);
    try {
      const payload: { status?: "satisfactory" | "unsatisfactory" | "na"; recommendation_text?: string | null } = {};
      if (edit.status !== undefined) payload.status = edit.status as "satisfactory" | "unsatisfactory" | "na";
      if (edit.text !== undefined) payload.recommendation_text = edit.text || null;

      const updated = await patchInspectionItem(inspectionId, itemId, payload);
      setWorkspace(updated);
      setItemEdits((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSavingItemId(null);
    }
  }

  async function saveField(fieldId: string) {
    const value = fieldEdits[fieldId];
    if (value === undefined) return;

    setSavingFieldId(fieldId);
    try {
      const updated = await patchRequiredField(inspectionId, fieldId, {
        field_value: value || null,
        is_satisfied: true,
      });
      setWorkspace(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSavingFieldId(null);
    }
  }

  async function handleGenerate() {
    setActionBusy("generate");
    setActionMessage(null);
    try {
      const updated = await generateInspection(inspectionId);
      setWorkspace(updated);
      setActionMessage({ type: "success", text: "Report generated." });
    } catch (err) {
      setActionMessage({ type: "error", text: err instanceof Error ? err.message : "Generate failed." });
    } finally {
      setActionBusy(null);
    }
  }

  async function saveGasMeta() {
    setSavingGasMeta(true);
    try {
      const updated = await patchInspectionMeta(inspectionId, {
        gas_license_number: gasLicenseNumber.trim() || null,
        gas_license_holder_name: gasLicenseHolder.trim() || null,
      });
      setWorkspace(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSavingGasMeta(false);
    }
  }

  async function handleSend() {
    setActionBusy("send");
    setActionMessage(null);
    try {
      const updated = await sendInspection(inspectionId);
      setWorkspace(updated);
      setActionMessage({ type: "success", text: "Report sent to customer." });
    } catch (err) {
      setActionMessage({ type: "error", text: err instanceof Error ? err.message : "Send failed." });
    } finally {
      setActionBusy(null);
    }
  }

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

  function itemStatusDot(status: string) {
    if (status === "satisfactory") return "bg-[color:var(--sem-state-success)]";
    if (status === "unsatisfactory") return "bg-[color:var(--sem-state-error)]";
    return "bg-[color:var(--sem-text-muted)]";
  }

  if (busy && !workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--cmp-surface-canvas)]">
        <Loader2 className="h-6 w-6 animate-spin text-[color:var(--sem-accent-primary)]" />
      </div>
    );
  }

  if (error && !workspace) {
    return (
      <div className="min-h-screen bg-[color:var(--cmp-surface-canvas)] px-4 py-10 text-[color:var(--sem-text-primary)]">
        <div className="mx-auto max-w-lg text-center">
          <p className="text-sm text-[color:var(--sem-danger)]">{error}</p>
          <Link href="/home" className="mt-4 inline-flex items-center gap-2 text-sm text-[color:var(--sem-accent-primary)]">
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (!workspace) return null;

  const meta = workspace.inspectionMeta;

  return (
    <div className="min-h-screen bg-[color:var(--cmp-surface-canvas)] pb-28 text-[color:var(--sem-text-primary)]">
      {/* Top bar */}
      <div className="sticky top-0 z-30 border-b border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-canvas)]/95 px-4 py-3 backdrop-blur-lg">
        <div className="flex items-center justify-between gap-3">
          <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-[color:var(--sem-text-muted)]">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="flex items-center gap-2">
            {saved ? (
              <span className="inline-flex items-center gap-1 text-xs text-[color:var(--sem-state-success)]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Saved
              </span>
            ) : null}
            <span className={statusBadge(meta.status)}>
              {meta.status.replace(/_/g, " ")}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        {/* Header card */}
        <div className={`${cardClass} p-4`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={labelClass}>Inspection</p>
              <h1 className="mt-1 text-lg font-semibold">
                {reportTypeLabels[meta.report_type] ?? meta.report_type}
              </h1>
              <p className="mt-0.5 text-xs text-[color:var(--sem-text-muted)]">#{meta.id.slice(0, 8)}</p>
            </div>
            <ClipboardList className="h-6 w-6 shrink-0 text-[color:var(--sem-accent-primary)]" />
          </div>

          {(meta.client_display_name_snapshot || meta.site_address_snapshot) ? (
            <div className="mt-4 space-y-1 border-t border-[color:var(--cmp-border-subtle)] pt-3">
              {meta.client_display_name_snapshot ? (
                <p className="text-sm font-medium">{meta.client_display_name_snapshot}</p>
              ) : null}
              {meta.site_address_snapshot ? (
                <p className="text-xs text-[color:var(--sem-text-secondary)]">{meta.site_address_snapshot}</p>
              ) : null}
              {meta.public_job_code ? (
                <p className="text-xs text-[color:var(--sem-text-muted)]">Job: {meta.public_job_code}</p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-[color:var(--sem-text-muted)]">
            {meta.report_number ? <span>Report: {meta.report_number}</span> : null}
            {meta.created_at ? (
              <span>Created: {new Date(meta.created_at).toLocaleDateString()}</span>
            ) : null}
          </div>
        </div>

        {/* Compliance / Gate status */}
        {workspace.liveScoreOrCompliance.gate_errors.length > 0 ? (
          <div className="rounded-xl border border-[color:var(--sem-state-warning)] bg-[color:color-mix(in_srgb,var(--sem-state-warning)_8%,transparent)] px-4 py-3 text-xs text-[color:var(--sem-text-secondary)]">
            <p className="font-semibold text-[color:var(--sem-state-warning)]">Gate issues</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {workspace.liveScoreOrCompliance.gate_errors.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Sections */}
        {sectionGroups.map((section) => {
          const isExpanded = expandedSection === section.key;
          const completedLabel = `${section.completed}/${section.total}`;

          return (
            <div key={section.key} className={`${cardClass} overflow-hidden`}>
              <button
                type="button"
                onClick={() => setExpandedSection(isExpanded ? null : section.key)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{formatSectionLabel(section.key)}</p>
                  <p className="mt-0.5 text-xs text-[color:var(--sem-text-muted)]">
                    {completedLabel} complete · {Math.round(section.completion_ratio * 100)}%
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="h-1.5 w-12 overflow-hidden rounded-full bg-[color:var(--cmp-border-subtle)]">
                    <div
                      className="h-full rounded-full bg-[color:var(--sem-accent-primary)] transition-all"
                      style={{ width: `${section.completion_ratio * 100}%` }}
                    />
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-[color:var(--sem-text-muted)]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[color:var(--sem-text-muted)]" />
                  )}
                </div>
              </button>

              {isExpanded ? (
                <div className="divide-y divide-[color:var(--cmp-border-subtle)] border-t border-[color:var(--cmp-border-subtle)]">
                  {section.items.map((item) => {
                    const currentStatus = getItemStatus(item.id, item.status);
                    const currentText = getItemText(item.id, item.recommendation_text);
                    const hasEdits = itemEdits[item.id] !== undefined;
                    const isSaving = savingItemId === item.id;

                    return (
                      <div key={item.id} className="space-y-3 px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{item.item_label}</p>
                            {item.is_legal_mandatory ? (
                              <span className="mt-0.5 inline-block text-[10px] uppercase tracking-[0.14em] text-[color:var(--sem-state-error)]">
                                Required
                              </span>
                            ) : null}
                          </div>
                          <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${itemStatusDot(currentStatus)}`} />
                        </div>

                        {/* Status radio */}
                        <div className="flex gap-2">
                          {(["satisfactory", "unsatisfactory", "na"] as const).map((status) => (
                            <button
                              key={status}
                              type="button"
                              disabled={!canManage || isSaving}
                              onClick={() => {
                                setItemEdits((prev) => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], status },
                                }));
                              }}
                              className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                                currentStatus === status
                                  ? "border-[color:var(--sem-accent-primary)] bg-[color:color-mix(in_srgb,var(--sem-accent-primary)_12%,transparent)] text-[color:var(--sem-accent-primary)]"
                                  : "border-[color:var(--cmp-border-subtle)] text-[color:var(--sem-text-muted)]"
                              }`}
                            >
                              {status === "satisfactory" ? "✓ OK" : status === "unsatisfactory" ? "✗ Issue" : "N/A"}
                            </button>
                          ))}
                        </div>

                        {/* Recommendation text */}
                        {currentStatus === "unsatisfactory" ? (
                          <div>
                            <textarea
                              className="theme-input-control w-full rounded-xl border px-3 py-2 text-sm placeholder:text-[color:var(--sem-text-muted)]"
                              rows={2}
                              placeholder="Recommendation..."
                              value={currentText}
                              onChange={(e) => {
                                setItemEdits((prev) => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], text: e.target.value },
                                }));
                              }}
                              disabled={!canManage || isSaving}
                            />
                          </div>
                        ) : null}

                        {/* Save button */}
                        {hasEdits ? (
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => saveItem(item.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--sem-accent-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {isSaving ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Save className="h-3 w-3" />
                            )}
                            Save
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}

        {/* Required fields */}
        {workspace.required_fields.length > 0 ? (
          <div className={`${cardClass} p-4`}>
            <p className={`${labelClass} mb-3`}>Required fields</p>
            <div className="space-y-3">
              {workspace.required_fields.map((field) => {
                const value = fieldEdits[field.id] ?? field.field_value ?? "";
                const isSaving = savingFieldId === field.id;
                const hasChanged = value !== (field.field_value ?? "");

                return (
                  <div key={field.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm">{field.field_label}</p>
                      {field.is_satisfied ? (
                        <span className="text-[10px] text-[color:var(--sem-state-success)]">✓ Complete</span>
                      ) : (
                        <span className="text-[10px] text-[color:var(--sem-text-muted)]">Pending</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="theme-input-control h-10 flex-1 rounded-xl border px-3 text-sm"
                        value={value}
                        onChange={(e) => setFieldEdits((prev) => ({ ...prev, [field.id]: e.target.value }))}
                        disabled={!canManage || isSaving}
                      />
                      {hasChanged ? (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => saveField(field.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-[color:var(--sem-accent-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Gas license (gas_fireplace only) */}
        {meta.report_type === "gas_fireplace" ? (
          <div className={`${cardClass} p-4`}>
            <p className={`${labelClass} mb-3`}>Gas License</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className="text-xs text-[color:var(--sem-text-muted)]">License number</p>
                <input
                  type="text"
                  className="theme-input-control h-10 w-full rounded-xl border px-3 text-sm"
                  value={gasLicenseNumber}
                  onChange={(e) => setGasLicenseNumber(e.target.value)}
                  disabled={!canManage || savingGasMeta}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-[color:var(--sem-text-muted)]">License holder name</p>
                <input
                  type="text"
                  className="theme-input-control h-10 w-full rounded-xl border px-3 text-sm"
                  value={gasLicenseHolder}
                  onChange={(e) => setGasLicenseHolder(e.target.value)}
                  disabled={!canManage || savingGasMeta}
                />
              </div>
              {gasLicenseNumber !== (meta.gas_license_number ?? "") || gasLicenseHolder !== (meta.gas_license_holder_name ?? "") ? (
                <button
                  type="button"
                  disabled={savingGasMeta}
                  onClick={saveGasMeta}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--sem-accent-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {savingGasMeta ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Actions */}
        {actionMessage ? (
          <div className={`rounded-xl px-4 py-3 text-sm ${actionMessage.type === "success" ? "bg-[color:color-mix(in_srgb,var(--sem-state-success)_12%,transparent)] text-[color:var(--sem-state-success)]" : "bg-[color:color-mix(in_srgb,var(--sem-state-error)_12%,transparent)] text-[color:var(--sem-state-error)]"}`}>
            {actionMessage.text}
          </div>
        ) : null}

        <div className="space-y-2">
          {workspace.liveScoreOrCompliance.can_generate && !meta.generated_pdf_url ? (
            <button
              type="button"
              disabled={actionBusy !== null}
              onClick={handleGenerate}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--sem-accent-primary)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {actionBusy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Generate Report
            </button>
          ) : null}

          {meta.generated_pdf_url ? (
            <a
              href={meta.generated_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--cmp-border-subtle)] px-6 py-3 text-sm font-medium text-[color:var(--sem-text-primary)] transition hover:bg-[color:var(--cmp-hover-surface)]"
            >
              <ExternalLink className="h-4 w-4" />
              Preview PDF
            </a>
          ) : null}

          {meta.generated_pdf_at && !meta.sent_to_customer_at ? (
            <button
              type="button"
              disabled={actionBusy !== null}
              onClick={handleSend}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--cmp-border-subtle)] px-6 py-3 text-sm font-medium text-[color:var(--sem-text-primary)] transition hover:bg-[color:var(--cmp-hover-surface)] disabled:opacity-50"
            >
              {actionBusy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Send to Customer
            </button>
          ) : null}
        </div>

        {/* Links */}
        <div className="flex flex-col gap-2 pt-2">
          <Link
            href="/inspections/new"
            className="flex items-center justify-center gap-2 rounded-xl border border-[color:var(--cmp-border-subtle)] px-6 py-3 text-sm text-[color:var(--sem-text-secondary)] transition hover:bg-[color:var(--cmp-hover-surface)]"
          >
            <ClipboardList className="h-4 w-4" />
            Create another inspection
          </Link>
          <Link
            href={`/inspections/${inspectionId}/workspace`}
            className="flex items-center justify-center gap-1.5 py-2 text-xs text-[color:var(--sem-text-muted)] transition hover:text-[color:var(--sem-accent-primary)]"
          >
            <ExternalLink className="h-3 w-3" />
            Open desktop workspace
          </Link>
        </div>
      </div>
    </div>
  );
}
