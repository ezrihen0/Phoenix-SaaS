"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { ChevronDown, Download, FileText, LoaderCircle, Mail, MessageSquare, PenLine, X } from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";

type InvoiceSnapshot = {
  id: string;
  invoice_id: string;
  document_number: string;
  total_cents: number;
  issued_at: string;
  due_at?: string | null;
  signature_requested?: boolean;
  snapshot_frozen?: boolean;
  email_sent_at?: string | null;
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

function formatDueDateLabel(issuedAt: string, dueAt?: string | null) {
  const baseDate = dueAt ? new Date(dueAt) : new Date(issuedAt);

  if (Number.isNaN(baseDate.getTime())) {
    return "N/A";
  }

  const dueDate = new Date(baseDate);
  if (!dueAt) {
    dueDate.setDate(dueDate.getDate() + 30);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(dueDate);
}

function splitCustomerFirstName(fullName: string | null | undefined) {
  const trimmed = fullName?.trim();
  if (!trimmed) {
    return "there";
  }
  return trimmed.split(/\s+/)[0] || "there";
}

function resolveInvoiceReference(invoice: InvoiceSnapshot) {
  return invoice.document_number?.trim() || invoice.invoice_id?.trim() || invoice.id;
}

function buildDefaultSubject(_invoice: InvoiceSnapshot, businessName?: string | null) {
  const company = businessName?.trim() || "your service provider";
  return `Your Invoice from ${company}`;
}

function buildDefaultBody(invoice: InvoiceSnapshot, businessName?: string | null) {
  const customerFirstName = splitCustomerFirstName(invoice.customer?.full_name);
  const company = businessName?.trim() || "your service provider";
  const invoiceNumber = resolveInvoiceReference(invoice);

  return [
    `Hi ${customerFirstName},`,
    "",
    `Thank you for choosing ${company}.`,
    "",
    `Your invoice ${invoiceNumber} is ready to review.`,
    "",
    "Please use the button below to securely view your invoice, service details, total amount, and current balance.",
    "",
    "If you have any questions regarding your service or invoice, simply reply to this email and our team will be happy to assist.",
    "",
    "Thank you again for your business.",
    "",
    company,
  ].join("\n");
}

function hasValidRecipientEmail(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  return trimmed
    .split(",")
    .map((part) => part.trim())
    .every((part) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part));
}

function getThemeCanvasColors() {
  const rootStyles = getComputedStyle(document.documentElement);
  const fill = rootStyles.getPropertyValue("--bg-card").trim() || rootStyles.getPropertyValue("--bg-primary").trim() || "var(--bg-canvas)";
  const stroke = rootStyles.getPropertyValue("--text-primary").trim() || "var(--text-primary)";

  return { fill, stroke };
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const ACTIONS_MENU_WIDTH_PX = 224;

function ModalPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(children, document.body);
}

function InvoiceActionModal({
  zIndexClass,
  ariaLabelledBy,
  onClose,
  children,
}: {
  zIndexClass: string;
  ariaLabelledBy: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <ModalPortal>
      <div
        className={cx(
          "fixed inset-0 flex items-start justify-center overflow-y-auto bg-[color:var(--bg-overlay)] px-4 py-[max(1rem,env(safe-area-inset-top))] pb-[max(6rem,env(safe-area-inset-bottom))] backdrop-blur-sm",
          zIndexClass,
        )}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={ariaLabelledBy}
          className="theme-modal-surface my-auto w-full max-w-2xl max-h-[min(90dvh,calc(100dvh-2rem))] overflow-y-auto rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5 shadow-[0_30px_100px_color-mix(in_srgb,var(--bg-canvas)_74%,transparent)] sm:p-6"
        >
          {children}
        </div>
      </div>
    </ModalPortal>
  );
}

function ExecutiveToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  primary,
  tone,
}: {
  icon: typeof Mail;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  tone?: "emerald" | "violet";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        primary
          ? "border-indigo-400/40 bg-indigo-500/20 text-indigo-100 shadow-[0_0_34px_rgba(99,102,241,0.16)] hover:bg-indigo-500/30"
          : tone === "violet"
            ? "border-violet-400/30 bg-violet-500/12 text-violet-100 hover:bg-violet-500/20"
            : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[color:var(--sem-text-secondary)] hover:bg-[color:var(--cmp-surface-soft)] hover:text-[color:var(--sem-text-primary)]",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
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
  const t = useTranslations("invoiceDetailPage");
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [isSignaturePadOpen, setIsSignaturePadOpen] = useState(false);
  const [isRefreshingInvoice, setIsRefreshingInvoice] = useState(false);
  const [isSendingInvoice, setIsSendingInvoice] = useState(false);
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);
  const [sendSuccessMessage, setSendSuccessMessage] = useState<string | null>(null);
  const [invoiceSnapshot, setInvoiceSnapshot] = useState<InvoiceSnapshot>(initialInvoice);
  const [fromField, setFromField] = useState(organizationEmail?.trim() || "");
  const [toField, setToField] = useState(initialInvoice.customer?.email?.trim() ?? "");
  const [subjectField, setSubjectField] = useState(buildDefaultSubject(initialInvoice, businessName));
  const [bodyField, setBodyField] = useState(buildDefaultBody(initialInvoice, businessName));
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const actionsButtonRef = useRef<HTMLButtonElement | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const [actionsMenuPosition, setActionsMenuPosition] = useState<{ top: number; left: number } | null>(null);

  const updateActionsMenuPosition = useCallback(() => {
    const button = actionsButtonRef.current;

    if (!button) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, rect.right - ACTIONS_MENU_WIDTH_PX),
      window.innerWidth - ACTIONS_MENU_WIDTH_PX - 8,
    );

    setActionsMenuPosition({
      top: rect.bottom + 8,
      left,
    });
  }, []);

  const sendFromAddress = useMemo(() => {
    const normalized = organizationEmail?.trim() || fromField.trim();

    return normalized || "";
  }, [fromField, organizationEmail]);

  const invoiceWasSentToCustomer = useMemo(
    () => Boolean(invoiceSnapshot.email_sent_at?.trim() || invoiceSnapshot.snapshot_frozen),
    [invoiceSnapshot.email_sent_at, invoiceSnapshot.snapshot_frozen],
  );

  const invoiceReference = useMemo(() => resolveInvoiceReference(invoiceSnapshot), [invoiceSnapshot]);

  const customerEmailMissing = !hasValidRecipientEmail(toField);

  useLayoutEffect(() => {
    if (!isActionsOpen) {
      setActionsMenuPosition(null);
      return;
    }

    updateActionsMenuPosition();
    window.addEventListener("resize", updateActionsMenuPosition);
    window.addEventListener("scroll", updateActionsMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateActionsMenuPosition);
      window.removeEventListener("scroll", updateActionsMenuPosition, true);
    };
  }, [isActionsOpen, updateActionsMenuPosition]);

  useEffect(() => {
    if (!isActionsOpen) {
      return;
    }

    function isInsideActionsSurface(target: EventTarget | null) {
      if (!(target instanceof Node)) {
        return false;
      }

      return (
        actionsButtonRef.current?.contains(target) === true
        || actionsMenuRef.current?.contains(target) === true
      );
    }

    function onPointerDown(event: PointerEvent) {
      if (isInsideActionsSurface(event.target)) {
        return;
      }

      setIsActionsOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsActionsOpen(false);
      }
    }

    const frameId = window.requestAnimationFrame(() => {
      window.addEventListener("pointerdown", onPointerDown);
    });
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isActionsOpen]);

  useEffect(() => {
    if (!isSendModalOpen && !isSignaturePadOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (isSendModalOpen) {
        setIsSendModalOpen(false);
      }

      if (isSignaturePadOpen) {
        setIsSignaturePadOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isSendModalOpen, isSignaturePadOpen]);

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
    setSendSuccessMessage(null);
    setIsSendModalOpen(true);
    setIsRefreshingInvoice(true);

    try {
      const latestInvoice = await crmApiFetch<InvoiceSnapshot>(`/api/invoices/${invoiceId}`);
      const latestCustomerEmail = latestInvoice.customer?.email?.trim() ?? "";

      setInvoiceSnapshot(latestInvoice);
      setFromField(organizationEmail?.trim() || "");
      setToField(latestCustomerEmail);
      setSubjectField(buildDefaultSubject(latestInvoice, businessName));
      setBodyField(buildDefaultBody(latestInvoice, businessName));
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

      const latestInvoice = await crmApiFetch<InvoiceSnapshot>(`/api/invoices/${invoiceId}`);
      setInvoiceSnapshot(latestInvoice);

      setSendSuccessMessage(`Invoice sent to ${response.to.join(", ")}.`);
      setIsSendModalOpen(false);
    } catch (error) {
      setActionErrorMessage(error instanceof Error ? error.message : "Invoice email could not be sent.");
    } finally {
      setIsSendingInvoice(false);
    }
  }

  async function handleSendSms() {
    setActionErrorMessage(null);
    setSendSuccessMessage(null);
    setIsSendingSms(true);

    try {
      const response = await crmApiFetch<{ sent_at: string; to: string[] }>(`/api/invoices/${invoiceId}/send-sms`, {
        method: "POST",
      });

      setSendSuccessMessage(`Invoice link sent via SMS to ${response.to.join(", ")}.`);
    } catch (error) {
      setActionErrorMessage(error instanceof Error ? error.message : "Invoice SMS could not be sent.");
    } finally {
      setIsSendingSms(false);
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
        <ExecutiveToolbarButton
          icon={Mail}
          label={
            isRefreshingInvoice
              ? t("loading")
              : invoiceWasSentToCustomer
                ? t("resendToCustomer")
                : t("sendToCustomer")
          }
          primary
          disabled={isRefreshingInvoice}
          onClick={() => {
            void refreshInvoiceForCompose();
          }}
        />
        <ExecutiveToolbarButton
          icon={MessageSquare}
          label={isSendingSms ? t("sendingSms") : t("sendSms")}
          disabled={isSendingSms}
          onClick={() => {
            void handleSendSms();
          }}
        />
        <ExecutiveToolbarButton
          icon={Download}
          label={t("downloadPdf")}
          disabled={!hasInvoiceLineItems}
          onClick={downloadPdf}
        />
        <ExecutiveToolbarButton
          icon={PenLine}
          label={t("signature")}
          tone="violet"
          onClick={() => setIsSignaturePadOpen(true)}
        />

        <button
          ref={actionsButtonRef}
          type="button"
          onClick={() => setIsActionsOpen((current) => !current)}
          className="flex items-center gap-2 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 px-4 py-3 text-sm font-semibold text-[color:var(--sem-text-secondary)] transition hover:bg-[color:var(--cmp-surface-soft)] hover:text-[color:var(--sem-text-primary)]"
          aria-haspopup="menu"
          aria-expanded={isActionsOpen}
        >
          {t("actions")}
          <ChevronDown className={cx("h-4 w-4 transition", isActionsOpen && "rotate-180")} />
        </button>

        {isActionsOpen && actionsMenuPosition ? (
          <ModalPortal>
              <div
                ref={actionsMenuRef}
                role="menu"
                className="fixed z-[190] overflow-hidden rounded-[16px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-1 shadow-[0_20px_60px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)]"
                style={{
                  top: actionsMenuPosition.top,
                  left: actionsMenuPosition.left,
                  width: ACTIONS_MENU_WIDTH_PX,
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={previewPdf}
                  disabled={!hasInvoiceLineItems}
                  className="flex w-full items-center justify-between rounded-[12px] px-3 py-2 text-left text-sm text-[color:var(--sem-text-secondary)] transition hover:bg-[color:var(--cmp-surface-soft)] hover:text-[color:var(--sem-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>{t("previewPdf")}</span>
                  <FileText className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsActionsOpen(false);
                    document.getElementById("document-approval-controls")?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }}
                  className="flex w-full items-center rounded-[12px] px-3 py-2 text-left text-sm text-[color:var(--sem-text-secondary)] transition hover:bg-[color:var(--cmp-surface-soft)] hover:text-[color:var(--sem-text-primary)]"
                >
                  {t("openApprovalSignature")}
                </button>
              </div>
          </ModalPortal>
        ) : null}
      </div>

      {sendSuccessMessage ? (
        <div className="theme-alert-success mt-3 rounded-[12px] border px-3 py-2 text-xs">
          {sendSuccessMessage}
        </div>
      ) : null}

      {actionErrorMessage && !isSendModalOpen ? (
        <div className="theme-alert-error mt-3 rounded-[12px] border px-3 py-2 text-xs">
          {actionErrorMessage}
        </div>
      ) : null}

      {isSendModalOpen ? (
        <InvoiceActionModal
          zIndexClass="z-[200]"
          ariaLabelledBy="send-invoice-modal-title"
          onClose={closeSendModal}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="send-invoice-modal-title" className="text-2xl font-semibold text-[color:var(--sem-text-primary)]">
                {invoiceWasSentToCustomer ? t("resendToCustomerTitle") : t("sendToCustomerTitle")}
              </h2>
              <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
                {t("sendToCustomerBody")}
              </p>
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-[color:var(--sem-text-muted)]">
                {t("invoiceReference", { invoiceNumber: invoiceReference })}
              </p>
            </div>
            <button
              type="button"
              onClick={closeSendModal}
              className="theme-btn-ghost inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              aria-label="Close send invoice dialog"
            >
              <X className="theme-icon h-4 w-4" />
            </button>
          </div>

          {isRefreshingInvoice ? (
            <div className="theme-alert-info mt-4 flex items-center gap-2 rounded-[12px] border px-3 py-2 text-xs">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              Refreshing invoice details…
            </div>
          ) : null}

          {actionErrorMessage && isSendModalOpen ? (
            <div className="theme-alert-error mt-4 rounded-[12px] border px-3 py-2 text-xs">{actionErrorMessage}</div>
          ) : null}

          <div className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm text-[color:var(--sem-text-secondary)]">
              <span>From</span>
              <input
                type="email"
                value={sendFromAddress}
                readOnly
                className="theme-input-control w-full rounded-[14px] px-4 py-2.5 text-sm"
              />
            </label>

            <label className="grid gap-2 text-sm text-[color:var(--sem-text-secondary)]">
              <span>To</span>
              <input
                type="text"
                value={toField}
                onChange={(event) => setToField(event.target.value)}
                placeholder="customer@example.com, billing@example.com"
                disabled={isRefreshingInvoice}
                className="theme-input-control w-full rounded-[14px] px-4 py-2.5 text-sm placeholder:text-[color:var(--sem-text-muted)] disabled:opacity-60"
              />
              {customerEmailMissing ? (
                <span className="text-xs text-red-300">{t("missingCustomerEmail")}</span>
              ) : (
                <span className="text-xs text-[color:var(--sem-text-muted)]">
                  {t("secureLinkHelper")}
                </span>
              )}
            </label>

            <label className="grid gap-2 text-sm text-[color:var(--sem-text-secondary)]">
              <span>Subject</span>
              <input
                type="text"
                value={subjectField}
                onChange={(event) => setSubjectField(event.target.value)}
                disabled={isRefreshingInvoice}
                className="theme-input-control w-full rounded-[14px] px-4 py-2.5 text-sm disabled:opacity-60"
              />
            </label>

            <label className="grid gap-2 text-sm text-[color:var(--sem-text-secondary)]">
              <span>Message</span>
              <textarea
                value={bodyField}
                onChange={(event) => setBodyField(event.target.value)}
                rows={6}
                disabled={isRefreshingInvoice}
                className="theme-input-control w-full rounded-[14px] px-4 py-3 text-sm disabled:opacity-60"
              />
            </label>
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
              disabled={isSendingInvoice || isRefreshingInvoice || customerEmailMissing}
              className="theme-btn-primary inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSendingInvoice ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {isSendingInvoice
                ? t("sendingToCustomer")
                : invoiceWasSentToCustomer
                  ? t("resendToCustomerAction")
                  : t("sendToCustomerAction")}
            </button>
          </div>
        </InvoiceActionModal>
      ) : null}

      {isSignaturePadOpen ? (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[210] flex items-start justify-center overflow-y-auto bg-[color:var(--bg-overlay)] px-4 py-[max(1rem,env(safe-area-inset-top))] pb-[max(6rem,env(safe-area-inset-bottom))] backdrop-blur-sm"
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
              className="theme-modal-surface my-auto w-full max-w-3xl max-h-[min(90dvh,calc(100dvh-2rem))] overflow-y-auto rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5 shadow-[0_30px_100px_color-mix(in_srgb,var(--bg-canvas)_74%,transparent)] sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="signature-pad-title" className="text-2xl font-semibold text-[color:var(--sem-text-primary)]">
                    Signature Pad
                  </h2>
                  <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
                    Capture the client signature on-site, then download it as a PNG.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeSignaturePad}
                  className="theme-btn-ghost inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  aria-label="Close signature dialog"
                >
                  <X className="theme-icon h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-4">
                <canvas
                  ref={signatureCanvasRef}
                  width={1200}
                  height={420}
                  onPointerDown={handleSignaturePointerDown}
                  onPointerMove={handleSignaturePointerMove}
                  onPointerUp={handleSignaturePointerUp}
                  onPointerLeave={handleSignaturePointerUp}
                  className="h-[min(280px,40dvh)] w-full touch-none rounded-[14px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]"
                />
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button type="button" onClick={clearSignatureCanvas} className="theme-btn-ghost rounded-full px-4 py-2 text-sm">
                  Clear
                </button>
                <button type="button" onClick={downloadSignatureImage} className="theme-btn-secondary rounded-full px-4 py-2 text-sm">
                  Download Signature
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </>
  );
}
