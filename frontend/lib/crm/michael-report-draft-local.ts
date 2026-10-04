import { createEmptyJob, type MichaelReportDraftBody, type MichaelReportJobPayload } from "@/lib/crm/phoenix-field-report";

const LOCAL_DRAFT_KEY = "phoenix-michael-report-local-v1";

export type MichaelReportLocalDraftBackup = {
  batchId: string | null;
  localEditedAt: number;
  serverDraftUpdatedAt: string | null;
  reportRecipientEmail: string;
  entries: MichaelReportJobPayload[];
  step: "edit" | "review";
};

export function normalizeMichaelReportJob(payload: Partial<MichaelReportJobPayload>): MichaelReportJobPayload {
  const empty = createEmptyJob();
  return {
    ...empty,
    ...payload,
    clientRowKey: payload.clientRowKey ?? empty.clientRowKey,
    companyParts: {
      ...empty.companyParts,
      ...payload.companyParts,
      costIncludingTaxCents: payload.companyParts?.costIncludingTaxCents ?? 0,
      partsCostConfirmed: payload.companyParts?.partsCostConfirmed === true,
    },
    productLines:
      payload.productLines && payload.productLines.length > 0
        ? payload.productLines.map((line) => ({
            description: line.description ?? "",
            warrantyEnabled: line.warrantyEnabled === true,
            warrantyMonths: line.warrantyMonths ?? null,
          }))
        : empty.productLines,
  };
}

export function readLocalMichaelReportDraft(): MichaelReportLocalDraftBackup | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_DRAFT_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as MichaelReportLocalDraftBackup;
    if (!parsed || !Array.isArray(parsed.entries)) {
      return null;
    }

    return {
      ...parsed,
      entries: parsed.entries.map((entry) => normalizeMichaelReportJob(entry)),
    };
  } catch {
    return null;
  }
}

export function writeLocalMichaelReportDraft(backup: Omit<MichaelReportLocalDraftBackup, "localEditedAt"> & { localEditedAt?: number }) {
  if (typeof window === "undefined") {
    return;
  }

  const payload: MichaelReportLocalDraftBackup = {
    ...backup,
    localEditedAt: backup.localEditedAt ?? Date.now(),
    entries: backup.entries.map((entry) => normalizeMichaelReportJob(entry)),
  };

  window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(payload));
}

export function clearLocalMichaelReportDraft() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(LOCAL_DRAFT_KEY);
}

export function idempotencyStorageKey(batchId: string) {
  return `phoenix-michael-report-submit-idempotency-${batchId}`;
}

const PENDING_SUBMIT_BATCH_KEY = "pending";

export function getOrCreateSubmitIdempotencyKey(batchId: string | null) {
  if (typeof window === "undefined") {
    return crypto.randomUUID();
  }

  const storageKey = idempotencyStorageKey(batchId ?? PENDING_SUBMIT_BATCH_KEY);
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing?.trim()) {
    return existing.trim();
  }

  const created = crypto.randomUUID();
  window.sessionStorage.setItem(storageKey, created);
  return created;
}

export function rememberSubmitIdempotencyKey(batchId: string, key: string) {
  if (typeof window === "undefined" || !key.trim()) {
    return;
  }

  window.sessionStorage.setItem(idempotencyStorageKey(batchId), key.trim());
}

export function draftBodyFromLocal(backup: MichaelReportLocalDraftBackup): MichaelReportDraftBody {
  return {
    reportRecipientEmail: backup.reportRecipientEmail,
    entries: backup.entries,
  };
}

export function parseServerDraftTimestamp(iso: string | null | undefined) {
  if (!iso) {
    return 0;
  }

  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}
