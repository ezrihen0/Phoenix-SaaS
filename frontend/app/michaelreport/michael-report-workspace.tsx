"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { LoaderCircle, Plus, Save, Send, Mail, RefreshCw } from "lucide-react";

import {
  centsToDollars,
  createEmptyJob,
  dollarsToCents,
  fetchMichaelReportDraft,
  previewMichaelReport,
  closeMichaelReportFeature,
  retryMichaelReportEmail,
  retryMichaelReportFailedImports,
  saveMichaelReportDraft,
  submitMichaelReport,
  verifyMichaelReportEmailDelivery,
  type MichaelReportBatchResponse,
  type MichaelReportDraftBody,
  type MichaelReportJobPayload,
  type MichaelReportPreviewRow,
} from "@/lib/crm/phoenix-field-report";

const DATE_MIN = "2026-09-11";
const DATE_MAX = "2026-10-04";

function FinancialBreakdown(props: {
  saleExcludingTaxCents: number | null;
  taxCents: number | null;
  saleIncludingTaxCents: number;
  partsCostIncludingTaxCents: number;
  remainingAfterPartsCents: number | null;
}) {
  return (
    <dl className="mt-2 space-y-1 text-sm text-slate-700">
      <div className="flex justify-between gap-4">
        <dt>Sale before tax</dt>
        <dd>{props.saleExcludingTaxCents != null ? `$${centsToDollars(props.saleExcludingTaxCents)}` : "—"}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt>Tax amount</dt>
        <dd>{props.taxCents != null ? `$${centsToDollars(props.taxCents)}` : "—"}</dd>
      </div>
      <div className="flex justify-between gap-4 font-medium">
        <dt>Sale including tax</dt>
        <dd>${centsToDollars(props.saleIncludingTaxCents)}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt>Parts cost including tax</dt>
        <dd>${centsToDollars(props.partsCostIncludingTaxCents)}</dd>
      </div>
      <div className="flex justify-between gap-4 font-medium text-slate-900">
        <dt>Remaining amount after parts</dt>
        <dd>
          {props.remainingAfterPartsCents != null ? `$${centsToDollars(props.remainingAfterPartsCents)}` : "—"}
        </dd>
      </div>
    </dl>
  );
}

const paymentOptions = [
  { value: "cash", label: "Cash" },
  { value: "e_transfer", label: "E-transfer" },
  { value: "card", label: "Card" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
  { value: "not_paid", label: "Not paid" },
] as const;

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-sm font-medium text-slate-800">{children}</label>;
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base shadow-sm focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600 ${props.className ?? ""}`}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base shadow-sm focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600 ${props.className ?? ""}`}
    />
  );
}

function importStatusLabel(status: MichaelReportBatchResponse["importStatus"]) {
  switch (status) {
    case "draft":
      return "Draft";
    case "imported":
      return "Saved to CRM";
    case "import_partial":
      return "Partially saved to CRM";
    default:
      return status;
  }
}

function emailProviderLabel(status: MichaelReportBatchResponse["emailProviderStatus"]) {
  switch (status) {
    case "not_sent":
      return "Not sent";
    case "pending":
      return "Sending…";
    case "accepted":
      return "Accepted by email provider (not inbox confirmation)";
    case "failed":
      return "Send failed";
    default:
      return status;
  }
}

export default function MichaelReportWorkspace({ isOwner }: { isOwner: boolean }) {
  const [reportRecipientEmail, setReportRecipientEmail] = useState("");
  const [entries, setEntries] = useState<MichaelReportJobPayload[]>([createEmptyJob()]);
  const [previewRows, setPreviewRows] = useState<MichaelReportPreviewRow[] | null>(null);
  const [step, setStep] = useState<"edit" | "review" | "done">("edit");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<MichaelReportBatchResponse["importStatus"]>("draft");
  const [emailProviderStatus, setEmailProviderStatus] =
    useState<MichaelReportBatchResponse["emailProviderStatus"]>("not_sent");
  const [emailDeliveryVerified, setEmailDeliveryVerified] = useState(false);
  const [orgFeatureClosed, setOrgFeatureClosed] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<Awaited<ReturnType<typeof submitMichaelReport>> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const editDraftBody: MichaelReportDraftBody = useMemo(
    () => ({ reportRecipientEmail: "", entries }),
    [entries],
  );

  const reviewDraftBody: MichaelReportDraftBody = useMemo(
    () => ({ reportRecipientEmail, entries }),
    [reportRecipientEmail, entries],
  );

  const applyBatchToState = useCallback((draft: MichaelReportBatchResponse) => {
    setBatchId(draft.batchId);
    setImportStatus(draft.importStatus);
    setEmailProviderStatus(draft.emailProviderStatus);
    setEmailDeliveryVerified(draft.emailDeliveryVerified);
    setOrgFeatureClosed(draft.orgFeatureClosed);
    setEmailError(draft.emailLastError);
    if (draft.reportRecipientEmail) {
      setReportRecipientEmail(draft.reportRecipientEmail);
    }
  }, []);

  const loadDraft = useCallback(async () => {
    try {
      const draft = await fetchMichaelReportDraft();
      applyBatchToState(draft);

      if (draft.entries.length > 0) {
        const editable = draft.entries
          .filter((entry) => entry.status === "draft")
          .map((entry) => ({
            ...entry.payload,
            companyParts: {
              ...entry.payload.companyParts,
              costIncludingTaxCents: entry.payload.companyParts.costIncludingTaxCents ?? 0,
              partsCostConfirmed: entry.payload.companyParts.partsCostConfirmed === true,
            },
          }));

        if (editable.length > 0) {
          setEntries(editable);
        }
      }

      if (draft.status !== "draft") {
        setStep("done");
      } else if (draft.orgFeatureClosed) {
        setStep("done");
      }
    } catch {
      // First visit — empty form is fine.
    }
  }, [applyBatchToState]);

  useEffect(() => {
    void loadDraft();
  }, [loadDraft]);

  const scheduleSave = useCallback(
    (body: MichaelReportDraftBody) => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }

      saveTimer.current = setTimeout(() => {
        startTransition(async () => {
          try {
            await saveMichaelReportDraft(body);
            setMessage("Draft saved.");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Draft could not be saved.");
          }
        });
      }, 800);
    },
    [startTransition],
  );

  useEffect(() => {
    if (step !== "edit") {
      return;
    }

    scheduleSave(editDraftBody);
  }, [editDraftBody, scheduleSave, step]);

  const updateEntry = (index: number, patch: Partial<MichaelReportJobPayload>) => {
    setEntries((current) =>
      current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)),
    );
  };

  const addJob = () => {
    setEntries((current) => [...current, createEmptyJob()]);
  };

  const removeJob = (index: number) => {
    setEntries((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== index)));
  };

  const runPreview = () => {
    startTransition(async () => {
      try {
        const preview = await previewMichaelReport(editDraftBody);
        setPreviewRows(preview.rows);
        setStep("review");
        setMessage(null);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Preview failed.");
      }
    });
  };

  const runSubmit = () => {
    startTransition(async () => {
      try {
        if (!reportRecipientEmail.trim()) {
          setMessage("Enter the email address where you want your report sent.");
          return;
        }

        const result = await submitMichaelReport(reviewDraftBody, idempotencyKeyRef.current);
        setSubmitResult(result);
        applyBatchToState(result);
        setStep("done");
        setMessage("CRM import and report delivery were submitted.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Submit failed.");
      }
    });
  };

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-slate-50 px-4 pb-24 pt-6">
      <header className="mb-6 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Phoenix Fireplace</p>
        <h1 className="text-2xl font-semibold text-slate-900">Historical Work Report</h1>
        <p className="text-sm text-slate-600">
          One-time historical entry for jobs from {DATE_MIN} through {DATE_MAX}. Drafts save automatically. You will
          choose where to email the PDF at the final step (separate from your login email).
        </p>
        <Link href="/home" className="text-sm text-amber-800 underline">
          Back to home
        </Link>
      </header>

      {message ? (
        <p className="mb-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{message}</p>
      ) : null}

      {step === "edit" ? (
        <>
          {entries.map((entry, index) => (
            <section key={entry.clientRowKey} className="mb-6 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Job {index + 1}</h2>
                {entries.length > 1 ? (
                  <button
                    type="button"
                    className="text-sm text-red-700 underline"
                    onClick={() => removeJob(index)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div>
                <FieldLabel>Work completion date</FieldLabel>
                <TextInput
                  type="date"
                  min={DATE_MIN}
                  max={DATE_MAX}
                  value={entry.workCompletedDate}
                  onChange={(event) => updateEntry(index, { workCompletedDate: event.target.value })}
                />
              </div>

              <div>
                <FieldLabel>Customer name</FieldLabel>
                <TextInput
                  value={entry.customerName}
                  onChange={(event) => updateEntry(index, { customerName: event.target.value })}
                />
              </div>

              <div>
                <FieldLabel>Service address</FieldLabel>
                <TextInput
                  value={entry.serviceAddressLine1}
                  onChange={(event) => updateEntry(index, { serviceAddressLine1: event.target.value })}
                  placeholder="Street address"
                />
                <TextInput
                  className="mt-2"
                  value={entry.serviceCity}
                  onChange={(event) => updateEntry(index, { serviceCity: event.target.value })}
                  placeholder="City"
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                    value={entry.serviceStateOrRegion}
                    onChange={(event) => updateEntry(index, { serviceStateOrRegion: event.target.value })}
                  >
                    <option value="AB">Alberta</option>
                    <option value="ON">Ontario</option>
                  </select>
                  <TextInput
                    value={entry.servicePostalCode}
                    onChange={(event) => updateEntry(index, { servicePostalCode: event.target.value })}
                    placeholder="Postal code"
                  />
                </div>
              </div>

              <div>
                <FieldLabel>Email</FieldLabel>
                <TextInput
                  type="email"
                  value={entry.customerEmail ?? ""}
                  onChange={(event) =>
                    updateEntry(index, { customerEmail: event.target.value.trim() || null })
                  }
                />
              </div>

              <div className="space-y-2">
                <FieldLabel>Products / services sold</FieldLabel>
                {entry.productLines.map((line, lineIndex) => (
                  <div key={`${entry.clientRowKey}-pl-${lineIndex}`} className="rounded-lg border border-slate-100 p-3">
                    <TextArea
                      rows={2}
                      value={line.description}
                      onChange={(event) => {
                        const productLines = [...entry.productLines];
                        productLines[lineIndex] = { ...line, description: event.target.value };
                        updateEntry(index, { productLines });
                      }}
                      placeholder="Description"
                    />
                    <label className="mt-2 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={line.warrantyEnabled}
                        onChange={(event) => {
                          const productLines = [...entry.productLines];
                          productLines[lineIndex] = {
                            ...line,
                            warrantyEnabled: event.target.checked,
                            warrantyMonths: event.target.checked ? line.warrantyMonths ?? 12 : null,
                          };
                          updateEntry(index, { productLines });
                        }}
                      />
                      Product warranty
                    </label>
                    {line.warrantyEnabled ? (
                      <TextInput
                        className="mt-2"
                        type="number"
                        min={1}
                        value={line.warrantyMonths ?? ""}
                        onChange={(event) => {
                          const productLines = [...entry.productLines];
                          productLines[lineIndex] = {
                            ...line,
                            warrantyMonths: Number(event.target.value) || null,
                          };
                          updateEntry(index, { productLines });
                        }}
                        placeholder="Warranty months"
                      />
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-sm text-amber-800"
                  onClick={() =>
                    updateEntry(index, {
                      productLines: [
                        ...entry.productLines,
                        { description: "", warrantyEnabled: false, warrantyMonths: null },
                      ],
                    })
                  }
                >
                  <Plus className="h-4 w-4" /> Add product line
                </button>
              </div>

              <div>
                <FieldLabel>Total charged (CAD, tax included)</FieldLabel>
                <TextInput
                  inputMode="decimal"
                  value={entry.totalChargedCents ? centsToDollars(entry.totalChargedCents) : ""}
                  onChange={(event) =>
                    updateEntry(index, { totalChargedCents: dollarsToCents(event.target.value) })
                  }
                />
              </div>

              <div>
                <FieldLabel>Company parts used</FieldLabel>
                <TextInput
                  value={entry.companyParts.description}
                  onChange={(event) =>
                    updateEntry(index, {
                      companyParts: { ...entry.companyParts, description: event.target.value },
                    })
                  }
                  placeholder="Description or None"
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <TextInput
                    value={entry.companyParts.quantity}
                    onChange={(event) =>
                      updateEntry(index, {
                        companyParts: { ...entry.companyParts, quantity: event.target.value },
                      })
                    }
                    placeholder="Quantity"
                  />
                  <div>
                    <FieldLabel>Parts cost including tax (CAD)</FieldLabel>
                    <TextInput
                      inputMode="decimal"
                      value={centsToDollars(entry.companyParts.costIncludingTaxCents ?? 0)}
                      onChange={(event) =>
                        updateEntry(index, {
                          companyParts: {
                            ...entry.companyParts,
                            costIncludingTaxCents: dollarsToCents(event.target.value),
                            partsCostConfirmed: false,
                          },
                        })
                      }
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <label className="mt-2 flex items-start gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={entry.companyParts.partsCostConfirmed === true}
                    onChange={(event) =>
                      updateEntry(index, {
                        companyParts: {
                          ...entry.companyParts,
                          partsCostConfirmed: event.target.checked,
                        },
                      })
                    }
                  />
                  <span>
                    I confirm this parts cost (including tax). Enter 0 when no company parts were used.
                  </span>
                </label>
              </div>

              <div>
                <FieldLabel>Customer left a review</FieldLabel>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                  value={entry.customerLeftReview ? "yes" : "no"}
                  onChange={(event) =>
                    updateEntry(index, { customerLeftReview: event.target.value === "yes" })
                  }
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>

              <div>
                <FieldLabel>Payment method</FieldLabel>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                  value={entry.paymentMethod}
                  onChange={(event) =>
                    updateEntry(index, {
                      paymentMethod: event.target.value as MichaelReportJobPayload["paymentMethod"],
                    })
                  }
                >
                  {paymentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <FieldLabel>Amount received (CAD)</FieldLabel>
                <TextInput
                  inputMode="decimal"
                  value={entry.amountReceivedCents ? centsToDollars(entry.amountReceivedCents) : ""}
                  onChange={(event) =>
                    updateEntry(index, { amountReceivedCents: dollarsToCents(event.target.value) })
                  }
                />
              </div>

              {entry.amountReceivedCents > 0 ? (
                <div>
                  <FieldLabel>Payment date</FieldLabel>
                  <TextInput
                    type="date"
                    min={DATE_MIN}
                    max={DATE_MAX}
                    value={entry.paymentDate ?? ""}
                    onChange={(event) => updateEntry(index, { paymentDate: event.target.value || null })}
                  />
                </div>
              ) : null}
            </section>
          ))}

          <button
            type="button"
            className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white py-3 text-sm font-medium text-slate-700"
            onClick={addJob}
          >
            <Plus className="h-4 w-4" /> Add another job
          </button>

          <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
            <div className="mx-auto flex max-w-lg gap-2">
              <button
                type="button"
                disabled={isPending}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                onClick={runPreview}
              >
                {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Review before submit
              </button>
            </div>
          </div>
        </>
      ) : null}

      {step === "review" && previewRows ? (
        <>
          <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <FieldLabel>Send report to this email</FieldLabel>
            <p className="mb-2 text-xs text-slate-600">
              This address is only for delivering your PDF report. It does not need to match the account you signed in
              with.
            </p>
            <TextInput
              type="email"
              value={reportRecipientEmail}
              onChange={(event) => setReportRecipientEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </section>

          <section className="mb-6 space-y-4">
            {previewRows.map((row, index) => (
              <article key={row.clientRowKey} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="font-semibold text-slate-900">
                  {index + 1}. {row.customerName}
                </h2>
                <p className="text-sm text-slate-600">{row.workCompletedDate}</p>
                {row.taxError ? <p className="mt-2 text-sm text-red-700">{row.taxError}</p> : null}
                <FinancialBreakdown
                  saleExcludingTaxCents={row.saleExcludingTaxCents}
                  taxCents={row.taxCents}
                  saleIncludingTaxCents={row.saleIncludingTaxCents}
                  partsCostIncludingTaxCents={row.partsCostIncludingTaxCents}
                  remainingAfterPartsCents={row.remainingAfterPartsCents}
                />
                {row.customerMatchRequired ? (
                  <div className="mt-3 space-y-2 rounded-lg bg-amber-50 p-3 text-sm">
                    <p className="font-medium text-amber-900">Choose a customer match</p>
                    {row.customerCandidates.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        className="block w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-left"
                        onClick={() => {
                          const entryIndex = entries.findIndex((entry) => entry.clientRowKey === row.clientRowKey);
                          if (entryIndex >= 0) {
                            updateEntry(entryIndex, { customerId: candidate.id, createNewCustomer: false });
                          }
                        }}
                      >
                        {candidate.fullName} — {candidate.matchReasons.join(", ")}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="w-full rounded-lg border border-amber-300 px-3 py-2 text-left font-medium"
                      onClick={() => {
                        const entryIndex = entries.findIndex((entry) => entry.clientRowKey === row.clientRowKey);
                        if (entryIndex >= 0) {
                          updateEntry(entryIndex, { customerId: null, createNewCustomer: true });
                        }
                      }}
                    >
                      Create new customer
                    </button>
                  </div>
                ) : null}
                {row.issues.length > 0 ? (
                  <ul className="mt-2 list-disc pl-5 text-sm text-red-700">
                    {row.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </section>

          <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
            <div className="mx-auto flex max-w-lg gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold"
                onClick={() => setStep("edit")}
              >
                Back
              </button>
              <button
                type="button"
                disabled={isPending}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                onClick={runSubmit}
              >
                {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit to CRM
              </button>
            </div>
          </div>
        </>
      ) : null}

      {step === "done" ? (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Submission status</h2>
          <ul className="space-y-2 text-sm text-slate-700">
            <li>
              <span className="font-medium">CRM import:</span> {importStatusLabel(importStatus)}
            </li>
            <li>
              <span className="font-medium">Report PDF:</span>{" "}
              {batchId ? "Saved on server — download below" : "Not available yet"}
            </li>
            <li>
              <span className="font-medium">Email provider:</span> {emailProviderLabel(emailProviderStatus)}
            </li>
            <li>
              <span className="font-medium">Inbox delivery verified:</span>{" "}
              {emailDeliveryVerified ? "Yes — owner confirmed receipt" : "Not yet — provider acceptance is not receipt"}
            </li>
            {orgFeatureClosed ? (
              <li className="font-medium text-amber-900">This one-time entry tool is closed for new submissions.</li>
            ) : null}
          </ul>
          {submitResult?.totals && typeof submitResult.totals === "object" ? (
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">Report totals</p>
              <FinancialBreakdown
                saleExcludingTaxCents={
                  typeof submitResult.totals.saleExcludingTaxCents === "number"
                    ? submitResult.totals.saleExcludingTaxCents
                    : null
                }
                taxCents={typeof submitResult.totals.taxCents === "number" ? submitResult.totals.taxCents : null}
                saleIncludingTaxCents={
                  typeof submitResult.totals.saleIncludingTaxCents === "number"
                    ? submitResult.totals.saleIncludingTaxCents
                    : 0
                }
                partsCostIncludingTaxCents={
                  typeof submitResult.totals.partsCostIncludingTaxCents === "number"
                    ? submitResult.totals.partsCostIncludingTaxCents
                    : 0
                }
                remainingAfterPartsCents={
                  typeof submitResult.totals.remainingAfterPartsCents === "number"
                    ? submitResult.totals.remainingAfterPartsCents
                    : null
                }
              />
            </div>
          ) : null}
          {emailError ? <p className="text-sm text-red-700">{emailError}</p> : null}
          {batchId ? (
            <a
              className="inline-flex text-sm font-medium text-amber-800 underline"
              href={`/api/phoenix-field-report/batches/${batchId}/pdf`}
            >
              Download PDF report
            </a>
          ) : null}
          {submitResult?.entries?.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-slate-100 p-3 text-sm">
              <p className="font-medium">{entry.payload.customerName}</p>
              <p>Status: {entry.status}</p>
              {entry.invoiceId ? <p>Invoice: {entry.invoiceId}</p> : null}
              {entry.lastErrorMessage ? <p className="text-red-700">{entry.lastErrorMessage}</p> : null}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {emailProviderStatus === "failed" && batchId ? (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
                onClick={() =>
                  startTransition(async () => {
                    if (!batchId) return;
                    const result = await retryMichaelReportEmail(batchId);
                    applyBatchToState(result);
                  })
                }
              >
                <Mail className="h-4 w-4" /> Retry email only
              </button>
            ) : null}
            {isOwner && emailProviderStatus === "accepted" && !emailDeliveryVerified && batchId ? (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 px-3 py-2 text-sm text-emerald-900"
                onClick={() =>
                  startTransition(async () => {
                    if (!batchId) return;
                    const result = await verifyMichaelReportEmailDelivery(batchId);
                    applyBatchToState(result);
                    setSubmitResult(result);
                    setMessage("Inbox delivery marked verified.");
                  })
                }
              >
                Confirm report received in inbox
              </button>
            ) : null}
            {isOwner && emailDeliveryVerified && !orgFeatureClosed && batchId ? (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg bg-amber-800 px-3 py-2 text-sm text-white"
                onClick={() =>
                  startTransition(async () => {
                    if (!batchId) return;
                    const result = await closeMichaelReportFeature(batchId);
                    applyBatchToState(result);
                    setOrgFeatureClosed(result.orgFeatureClosed);
                    setMessage("Historical report tool closed. Set MICHAEL_HISTORICAL_REPORT_ENABLED=false in production when convenient.");
                  })
                }
              >
                Close one-time report tool
              </button>
            ) : null}
            {batchId ? (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                onClick={() =>
                  startTransition(async () => {
                    const result = await retryMichaelReportFailedImports(batchId);
                    setSubmitResult(result as typeof submitResult);
                  })
                }
              >
                <RefreshCw className="h-4 w-4" /> Retry failed imports
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
