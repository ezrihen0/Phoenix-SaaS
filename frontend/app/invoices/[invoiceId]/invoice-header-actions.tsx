"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, Download, FileText, LoaderCircle, X } from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";

type InvoiceSnapshot = {
  id: string;
  invoice_id: string;
  document_number: string;
  total_cents: number;
  issued_at: string;
  signature_requested?: boolean;
  customer: {
    full_name: string;
    email: string | null;
  } | null;
};

type SendInvoiceResponse = {
  invoice_id: string;
  document_number: string;
  sent_at: string;
  to: string[];
  message_id: string;
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDueDateFromIssuedAt(issuedAt: string) {
  const baseDate = new Date(issuedAt);

  if (Number.isNaN(baseDate.getTime())) {
    return "N/A";
  }

  const dueDate = new Date(baseDate);
  dueDate.setDate(dueDate.getDate() + 30);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(dueDate);
}

function buildDefaultSubject(invoice: InvoiceSnapshot, businessName?: string | null) {
  const from = businessName?.trim() || "your service provider";
  return `Invoice #${invoice.invoice_id || invoice.document_number} from ${from}`;
}

function buildDefaultBody(invoice: InvoiceSnapshot, businessName?: string | null) {
  const customerName = invoice.customer?.full_name?.trim() || "there";
  const totalLabel = formatCurrency(invoice.total_cents);
  const dueDateLabel = formatDueDateFromIssuedAt(invoice.issued_at);
  const from = businessName?.trim() || "us";

  return `Hi ${customerName},\n\nThanks again for choosing ${from}! Your invoice total is ${totalLabel}, and is due by ${dueDateLabel}.`;
}

function getThemeCanvasColors() {
  const rootStyles = getComputedStyle(document.documentElement);
  const fill = rootStyles.getPropertyValue("--bg-card").trim() || rootStyles.getPropertyValue("--bg-primary").trim() || "var(--bg-canvas)";
  const stroke = rootStyles.getPropertyValue("--text-primary").trim() || "var(--text-primary)";

  return { fill, stroke };
}

export default function InvoiceHeaderActions({
  invoiceId,
  initialInvoice,
  organizationEmail,
  businessName,
  hasInvoiceLineItems,
}: {
  invoiceId: string;
  initialInvoice: InvoiceSnapshot;
  organizationEmail: string | null;
  businessName: string | null;
  hasInvoiceLineItems: boolean;
}) {
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [isSignaturePadOpen, setIsSignaturePadOpen] = useState(false);
  const [isRefreshingInvoice, setIsRefreshingInvoice] = useState(false);
  const [isSendingInvoice, setIsSendingInvoice] = useState(false);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);
  const [sendSuccessMessage, setSendSuccessMessage] = useState<string | null>(null);
  const [invoiceSnapshot, setInvoiceSnapshot] = useState<InvoiceSnapshot>(initialInvoice);
  const [fromField, setFromField] = useState(organizationEmail?.trim() || "");
  const [toField, setToField] = useState(initialInvoice.customer?.email?.trim() ?? "");
  const [subjectField, setSubjectField] = useState(buildDefaultSubject(initialInvoice));
  const [bodyField, setBodyField] = useState(buildDefaultBody(initialInvoice));
  const [creditCardEnabled, setCreditCardEnabled] = useState(true);
  const [requestSignature, setRequestSignature] = useState(Boolean(initialInvoice.signature_requested));

  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const sendFromAddress = useMemo(() => {
    const normalized = organizationEmail?.trim() || fromField.trim();

    return normalized || "";
  }, [fromField, organizationEmail]);

  useEffect(() => {
    if (!isActionsOpen) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current) {
        return;
      }

      if (event.target instanceof Node && !menuRef.current.contains(event.target)) {
        setIsActionsOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsActionsOpen(false);
      }
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isActionsOpen]);

  useEffect(() => {
    if (!isSignaturePadOpen || !signatureCanvasRef.current) {
      return;
    }

    const canvas = signatureCanvasRef.current;
    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    const colors = getThemeCanvasColors();
    context.fillStyle = colors.fill;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = colors.stroke;
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";
  }, [isSignaturePadOpen]);

  function closeSendModal() {
    setIsSendModalOpen(false);
  }

  function closeSignaturePad() {
    setIsSignaturePadOpen(false);
  }

  async function refreshInvoiceForCompose() {
    setActionErrorMessage(null);
    setIsRefreshingInvoice(true);

    try {
      const latestInvoice = await crmApiFetch<InvoiceSnapshot>(`/api/invoices/${invoiceId}`);
      const latestCustomerEmail = latestInvoice.customer?.email?.trim() ?? "";

      setInvoiceSnapshot(latestInvoice);
      setFromField(organizationEmail?.trim() || "");
      setToField(latestCustomerEmail);
      setSubjectField(buildDefaultSubject(latestInvoice, businessName));
      setBodyField(buildDefaultBody(latestInvoice, businessName));
      setIsSendModalOpen(true);
    } catch (error) {
      setActionErrorMessage(error instanceof Error ? error.message : "Invoice data could not be refreshed.");
    } finally {
      setIsRefreshingInvoice(false);
    }
  }

  async function handleSendInvoice() {
    setActionErrorMessage(null);
    setSendSuccessMessage(null);
    setIsSendingInvoice(true);

    try {
      const payload = {
        to: toField || undefined,
        subject: subjectField || undefined,
        body: bodyField || undefined,
      };

      const response = await crmApiFetch<SendInvoiceResponse>(`/api/invoices/${invoiceId}/send-email`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setSendSuccessMessage(`Invoice sent to ${response.to.join(", ")}.`);
      setIsSendModalOpen(false);
    } catch (error) {
      setActionErrorMessage(error instanceof Error ? error.message : "Invoice email could not be sent.");
    } finally {
      setIsSendingInvoice(false);
    }
  }

  function previewPdf() {
    setActionErrorMessage(null);
    window.open(`/api/invoices/${invoiceId}/pdf`, "_blank", "noopener,noreferrer");
    setIsActionsOpen(false);
  }

  function downloadPdf() {
    setActionErrorMessage(null);

    const downloadLink = document.createElement("a");
    downloadLink.href = `/api/invoices/${invoiceId}/pdf?download=1`;
    downloadLink.target = "_blank";
    downloadLink.rel = "noopener noreferrer";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();

    setIsActionsOpen(false);
  }

  function getCanvasCoordinates(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current;

    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function handleSignaturePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    const point = getCanvasCoordinates(event);

    if (!canvas || !context || !point) {
      return;
    }

    isDrawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function handleSignaturePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) {
      return;
    }

    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    const point = getCanvasCoordinates(event);

    if (!canvas || !context || !point) {
      return;
    }

    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function handleSignaturePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current;

    if (!canvas) {
      return;
    }

    isDrawingRef.current = false;

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  function clearSignatureCanvas() {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const colors = getThemeCanvasColors();
    context.fillStyle = colors.fill;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  function downloadSignatureImage() {
    const canvas = signatureCanvasRef.current;

    if (!canvas) {
      return;
    }

    const imageLink = document.createElement("a");
    imageLink.href = canvas.toDataURL("image/png");
    imageLink.download = `${invoiceSnapshot.invoice_id || invoiceSnapshot.document_number}-signature.png`;
    imageLink.click();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            void refreshInvoiceForCompose();
          }}
          disabled={isRefreshingInvoice}
          className="theme-btn-primary inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRefreshingInvoice ? "Loading..." : "Send"}
        </button>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setIsActionsOpen((current) => !current)}
            className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
            aria-haspopup="menu"
            aria-expanded={isActionsOpen}
          >
            Actions
            <ChevronDown className="theme-icon-accent h-4 w-4" />
          </button>

          {isActionsOpen ? (
            <div className="theme-modal-surface absolute right-0 z-[120] mt-2 w-56 overflow-hidden rounded-[16px] p-1 shadow-[0_20px_60px_color-mix(in_srgb,var(--bg-canvas)_62%,transparent)]">
              <button
                type="button"
                role="menuitem"
                onClick={previewPdf}
                disabled={!hasInvoiceLineItems}
                className="theme-menu-item flex w-full items-center justify-between rounded-[12px] px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>Preview</span>
                <FileText className="theme-icon h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={downloadPdf}
                disabled={!hasInvoiceLineItems}
                className="theme-menu-item flex w-full items-center justify-between rounded-[12px] px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>Download</span>
                <Download className="theme-icon h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsActionsOpen(false);
                  setIsSignaturePadOpen(true);
                }}
                className="theme-menu-item flex w-full items-center rounded-[12px] px-3 py-2 text-left text-sm"
              >
                Sign
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsActionsOpen(false);
                  void refreshInvoiceForCompose();
                }}
                className="theme-menu-item flex w-full items-center rounded-[12px] px-3 py-2 text-left text-sm"
              >
                Request Signature
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {sendSuccessMessage ? (
        <div className="theme-alert-success mt-3 rounded-[12px] border px-3 py-2 text-xs">
          {sendSuccessMessage}
        </div>
      ) : null}

      {actionErrorMessage ? (
        <div className="theme-alert-error mt-3 rounded-[12px] border px-3 py-2 text-xs">
          {actionErrorMessage}
        </div>
      ) : null}

      {isSendModalOpen ? (
        <div
          className="fixed inset-0 z-[180] flex items-center justify-center bg-[color:var(--bg-overlay)] px-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeSendModal();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-invoice-modal-title"
            className="theme-modal-surface w-full max-w-2xl rounded-[28px] p-6 shadow-[0_30px_100px_color-mix(in_srgb,var(--bg-canvas)_74%,transparent)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="send-invoice-modal-title" className="text-2xl font-semibold text-[color:var(--text-primary)]">Send Invoice</h2>
                <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
                  Review email recipients, message, and delivery options before sending.
                </p>
              </div>
              <button
                type="button"
                onClick={closeSendModal}
                className="theme-btn-ghost inline-flex h-10 w-10 items-center justify-center rounded-full"
                aria-label="Close send invoice dialog"
              >
                <X className="theme-icon h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="grid gap-2 text-sm text-[color:var(--text-secondary)]">
                <span>From</span>
                <input
                  type="email"
                  value={sendFromAddress}
                  readOnly
                  className="theme-input-control w-full rounded-[14px] px-4 py-2.5 text-sm"
                />
              </label>

              <label className="grid gap-2 text-sm text-[color:var(--text-secondary)]">
                <span>To</span>
                <input
                  type="text"
                  value={toField}
                  onChange={(event) => setToField(event.target.value)}
                  placeholder="customer@example.com, billing@example.com"
                  className="theme-input-control w-full rounded-[14px] px-4 py-2.5 text-sm placeholder:text-[color:var(--text-secondary)]"
                />
                <span className="text-xs text-[color:var(--text-secondary)]">Multiple recipients are supported with comma-separated email addresses.</span>
              </label>

              <label className="grid gap-2 text-sm text-[color:var(--text-secondary)]">
                <span>Subject</span>
                <input
                  type="text"
                  value={subjectField}
                  onChange={(event) => setSubjectField(event.target.value)}
                  className="theme-input-control w-full rounded-[14px] px-4 py-2.5 text-sm placeholder:text-[color:var(--text-secondary)]"
                />
              </label>

              <label className="grid gap-2 text-sm text-[color:var(--text-secondary)]">
                <span>Message</span>
                <textarea
                  value={bodyField}
                  onChange={(event) => setBodyField(event.target.value)}
                  rows={6}
                  className="theme-input-control w-full rounded-[14px] px-4 py-3 text-sm placeholder:text-[color:var(--text-secondary)]"
                />
              </label>

              <div className="grid gap-2 rounded-[16px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-4 text-sm text-[color:var(--text-primary)]">
                <label className="inline-flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={creditCardEnabled}
                    onChange={(event) => setCreditCardEnabled(event.target.checked)}
                    className="h-4 w-4 cursor-pointer rounded border-[color:var(--input-border)] bg-transparent accent-[color:var(--text-accent)] transition hover:border-[color:var(--border-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--input-focus-ring)]"
                  />
                  Credit Card (include Pay Now link)
                </label>

                <label className="inline-flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={requestSignature}
                    onChange={(event) => setRequestSignature(event.target.checked)}
                    className="h-4 w-4 cursor-pointer rounded border-[color:var(--input-border)] bg-transparent accent-[color:var(--text-accent)] transition hover:border-[color:var(--border-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--input-focus-ring)]"
                  />
                  Request Signature (include e-signature link)
                </label>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeSendModal}
                disabled={isSendingInvoice}
                className="theme-btn-ghost rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSendInvoice();
                }}
                disabled={isSendingInvoice}
                className="theme-btn-primary inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSendingInvoice ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                {isSendingInvoice ? "Sending..." : "Send Invoice"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isSignaturePadOpen ? (
        <div
          className="fixed inset-0 z-[190] flex items-center justify-center bg-[color:var(--bg-overlay)] px-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeSignaturePad();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="signature-pad-title"
            className="theme-modal-surface w-full max-w-3xl rounded-[28px] p-6 shadow-[0_30px_100px_color-mix(in_srgb,var(--bg-canvas)_74%,transparent)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="signature-pad-title" className="text-2xl font-semibold text-[color:var(--text-primary)]">Signature Pad</h2>
                <p className="mt-2 text-sm text-[color:var(--text-secondary)]">Capture the client signature on-site, then download it as a PNG.</p>
              </div>
              <button
                type="button"
                onClick={closeSignaturePad}
                className="theme-btn-ghost inline-flex h-10 w-10 items-center justify-center rounded-full"
                aria-label="Close signature dialog"
              >
                <X className="theme-icon h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 rounded-[20px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-4">
              <canvas
                ref={signatureCanvasRef}
                width={1200}
                height={420}
                onPointerDown={handleSignaturePointerDown}
                onPointerMove={handleSignaturePointerMove}
                onPointerUp={handleSignaturePointerUp}
                onPointerLeave={handleSignaturePointerUp}
                className="h-[280px] w-full touch-none rounded-[14px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)]"
              />
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={clearSignatureCanvas}
                className="theme-btn-ghost rounded-full px-4 py-2 text-sm"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={downloadSignatureImage}
                className="theme-btn-secondary rounded-full px-4 py-2 text-sm"
              >
                Download Signature
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}