"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  LoaderCircle,
  Mail,
  MessageSquare,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  Sparkles,
  StickyNote,
  Trash2,
} from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";

/** Toggle prior lane-rail layout for rollback and QA. */
const SHOW_LEGACY_MESSAGING_LAYOUT = false;

const deskPanelClass =
  "theme-surface-card border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--sem-accent-primary)_8%,transparent)] backdrop-blur-md";
const deskEyebrowClass = "text-[10px] uppercase tracking-[0.32em] text-[color:var(--sem-text-muted)]";

type Lane = "customers" | "unknown";
type InboxFilter = "all" | "customers" | "unknown";
type ComposerSurfaceMode = "customer" | "note";

type UnifiedConversationRow = {
  key: string;
  kind: "customer" | "unknown";
  customerId: string | null;
  phoneKey: string | null;
  displayName: string;
  phoneNumber: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};

type CustomerConversationRow = {
  customerId: string;
  customerName: string | null;
  phoneNumber: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};

type UnknownConversationRow = {
  phoneKey: string;
  phoneNumber: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};

type MessagingDashboardResponse = {
  customers: CustomerConversationRow[];
  unknownNumbers: UnknownConversationRow[];
};

type MessagingTxtConversationRow = {
  id: string;
  kind: "customer" | "unknown";
  customerId: string | null;
  customerName: string | null;
  phoneNumber: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};

type MessagingTxtConversationsResponse = {
  unreadCount: number;
  items: MessagingTxtConversationRow[];
};

type EmailDashboardCustomerRow = {
  customerId: string;
  customerName: string | null;
  customerEmail: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};

type EmailDashboardResponse = {
  unreadCount: number;
  items: EmailDashboardCustomerRow[];
};

type TextThreadItem = {
  id: string;
  customerId: string | null;
  direction: "inbound" | "outbound";
  phoneNumber: string | null;
  body: string;
  createdAt: string;
  sentAt: string | null;
  deliveryStatus: string;
  provider: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  unread: boolean;
};

type TextThreadResponse = {
  unreadCount: number;
  items: TextThreadItem[];
};

type SmsTemplateItem = {
  id: string;
  name: string;
  body: string;
  sortOrder: number;
  quickPickOrder: number | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

type SmsTemplatesResponse = {
  items: SmsTemplateItem[];
};

type EmailThreadItem = {
  id: string;
  customerId: string;
  direction: "inbound" | "outbound";
  subject: string;
  body: string;
  htmlBody: string | null;
  fromEmail: string | null;
  toEmail: string | null;
  provider: string;
  providerMessageId: string | null;
  inReplyTo: string | null;
  deliveryStatus: string;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
  unread: boolean;
};

type EmailThreadResponse = {
  unreadCount: number;
  items: EmailThreadItem[];
};

type CustomerPickerItem = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
};

type CustomersPickerResponse = {
  items: CustomerPickerItem[];
};

type MessagingShortLinkResponse = {
  publicConversationCode: string;
  shortId?: string;
  conversationId: string;
  lane: "customers" | "unknown";
  customerId: string | null;
  phoneKey: string | null;
};

function formatTime(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function formatDeliveryStatus(value: string) {
  switch (value) {
    case "sent":
      return "Sent";
    case "failed_delivery":
      return "Delivery failed";
    case "received":
      return "Received";
    default:
      return value.replace(/_/g, " ");
  }
}

function formatRelativeTime(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 60_000));

  if (diffMinutes < 1) {
    return "now";
  }

  if (diffMinutes < 60) {
    return String(diffMinutes) + "m";
  }

  const hours = Math.floor(diffMinutes / 60);

  if (hours < 24) {
    return String(hours) + "h";
  }

  return String(Math.floor(hours / 24)) + "d";
}

function buildUnifiedRows(dashboard: MessagingDashboardResponse): UnifiedConversationRow[] {
  const customerRows: UnifiedConversationRow[] = dashboard.customers.map((row) => ({
    key: `customer:${row.customerId}`,
    kind: "customer",
    customerId: row.customerId,
    phoneKey: null,
    displayName: row.customerName?.trim() || "Unknown customer",
    phoneNumber: row.phoneNumber,
    lastMessage: row.lastMessage,
    lastMessageAt: row.lastMessageAt,
    unreadCount: row.unreadCount,
  }));

  const unknownRows: UnifiedConversationRow[] = dashboard.unknownNumbers.map((row) => ({
    key: `phone:${row.phoneKey}`,
    kind: "unknown",
    customerId: null,
    phoneKey: row.phoneKey,
    displayName: row.phoneNumber?.trim() || row.phoneKey,
    phoneNumber: row.phoneNumber,
    lastMessage: row.lastMessage,
    lastMessageAt: row.lastMessageAt,
    unreadCount: row.unreadCount,
  }));

  return [...customerRows, ...unknownRows];
}

function sortConversationRows(rows: UnifiedConversationRow[]) {
  return [...rows].sort((left, right) => {
    const leftUnread = left.unreadCount > 0;
    const rightUnread = right.unreadCount > 0;

    if (leftUnread !== rightUnread) {
      return leftUnread ? -1 : 1;
    }

    if (leftUnread && rightUnread) {
      const newestInboundDelta = new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime();

      if (newestInboundDelta !== 0) {
        return newestInboundDelta;
      }
    }

    if (left.kind !== right.kind) {
      return left.kind === "customer" ? -1 : 1;
    }

    return new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime();
  });
}

function isUnifiedRowActive(row: UnifiedConversationRow, lane: Lane, selectedCustomerId: string | null, selectedPhoneKey: string | null) {
  if (row.kind === "customer") {
    return lane === "customers" && row.customerId === selectedCustomerId;
  }

  return lane === "unknown" && row.phoneKey === selectedPhoneKey;
}

type DeskThreadPanelProps = {
  composeMode: "text" | "email" | null;
  closeComposer: () => void;
  composeError: string | null;
  composeModeText: boolean;
  customerSearch: string;
  setCustomerSearch: (value: string) => void;
  isLoadingPicker: boolean;
  filteredPickerResults: CustomerPickerItem[];
  selectedComposeCustomer: CustomerPickerItem | null;
  setSelectedComposeCustomer: (value: CustomerPickerItem | null) => void;
  composeDirectRecipient: string;
  setComposeDirectRecipient: (value: string) => void;
  canUseDirectNumber: boolean;
  canUseDirectEmail: boolean;
  normalizedSearchDigits: string;
  composeEmailToOverride: string;
  setComposeEmailToOverride: (value: string) => void;
  lane: Lane;
  selectedConversation: CustomerConversationRow | UnknownConversationRow | null;
  selectedCustomerId: string | null;
  selectedPhoneKey: string | null;
  selectedConversationId: string | null;
  textThread: TextThreadResponse;
  hasUnreadMessages: boolean;
  hasInboundMessages: boolean;
  isUpdatingReadState: boolean;
  isLoadingThread: boolean;
  threadError: string | null;
  orderedTextMessages: TextThreadItem[];
  updateReadState: (nextAction: "read" | "unread") => Promise<void>;
  quickTemplates: SmsTemplateItem[];
  isLoadingTemplates: boolean;
  templatesError: string | null;
  openTemplateBank: () => void;
  handleApplyTemplate: (template: SmsTemplateItem) => void;
  composerSurfaceMode: ComposerSurfaceMode;
  setComposerSurfaceMode: (mode: ComposerSurfaceMode) => void;
  composeTextBody: string;
  setComposeTextBody: (value: string) => void;
  composeEmailSubject: string;
  setComposeEmailSubject: (value: string) => void;
  composeEmailBody: string;
  setComposeEmailBody: (value: string) => void;
  isComposeSending: boolean;
  handleComposeSend: () => Promise<void>;
  textDraft: string;
  setTextDraft: (value: string) => void;
  isSending: boolean;
  handleSend: () => Promise<void>;
  formatTime: (value: string) => string;
  formatDeliveryStatus: (value: string) => string;
};

function DeskThreadPanel(props: DeskThreadPanelProps) {
  const isNoteMode = props.composerSurfaceMode === "note" && !props.composeMode;
  const threadTitle = props.composeMode
    ? props.composeMode === "text"
      ? "New SMS"
      : "New email"
    : props.lane === "customers"
      ? (props.selectedConversation as CustomerConversationRow | null)?.customerName ?? "Select a thread"
      : (props.selectedConversation as UnknownConversationRow | null)?.phoneNumber
        ?? (props.selectedConversation as UnknownConversationRow | null)?.phoneKey
        ?? "Select a thread";

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--cmp-border-subtle)] px-5 py-4">
        <div className="min-w-0">
          <p className={deskEyebrowClass}>{props.composeMode ? "New conversation" : "Active thread"}</p>
          <h2 className="truncate text-lg font-semibold text-[color:var(--sem-display-headline)]">{threadTitle}</h2>
          {!props.composeMode && props.lane === "customers" && props.selectedCustomerId ? (
            <Link href={`/customers/${props.selectedCustomerId}`} className="mt-1 inline-block text-xs text-[color:var(--sem-accent-primary)] hover:underline">
              Open customer profile
            </Link>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!props.composeMode && props.selectedConversationId ? (
            <>
              <button
                type="button"
                onClick={() => void props.updateReadState("read")}
                disabled={props.isUpdatingReadState || props.isLoadingThread || !props.hasUnreadMessages}
                className="theme-control-surface rounded-full px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                Mark read
              </button>
              <button
                type="button"
                onClick={() => void props.updateReadState("unread")}
                disabled={props.isUpdatingReadState || props.isLoadingThread || !props.hasInboundMessages}
                className="theme-control-surface rounded-full px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                Mark unread
              </button>
            </>
          ) : null}
          {props.composeMode ? (
            <button type="button" onClick={props.closeComposer} className="theme-control-surface rounded-full px-3 py-1 text-xs">
              Close
            </button>
          ) : null}
        </div>
      </div>

      {props.threadError ? (
        <div className="theme-alert-error mx-5 mt-3 rounded-[16px] border px-3 py-2 text-sm">{props.threadError}</div>
      ) : null}
      {props.composeError ? (
        <div className="theme-alert-error mx-5 mt-3 rounded-[16px] border px-3 py-2 text-sm">{props.composeError}</div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {props.composeMode ? (
          <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-3">
            <label className="block">
              <span className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-[color:var(--sem-text-muted)]">
                {props.composeModeText ? "Search customer or type number" : "Search customer or type email"}
              </span>
              <input
                type="text"
                value={props.customerSearch}
                onChange={(event) => props.setCustomerSearch(event.target.value)}
                className="theme-input-control h-11 w-full rounded-[14px] px-3 text-sm"
                placeholder={props.composeModeText ? "Start typing phone number..." : "Start typing email..."}
              />
            </label>
            <div className="mt-3 max-h-52 overflow-auto rounded-[14px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-canvas)] p-2">
              {props.isLoadingPicker ? (
                <p className="text-sm text-[color:var(--sem-text-secondary)]">
                  <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />
                  Searching customers...
                </p>
              ) : (
                <div className="space-y-1">
                  {props.filteredPickerResults.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => {
                        props.setSelectedComposeCustomer(customer);
                        props.setComposeDirectRecipient("");
                      }}
                      className={[
                        "w-full rounded-[12px] px-3 py-2 text-left text-sm",
                        props.selectedComposeCustomer?.id === customer.id && !props.composeDirectRecipient
                          ? "bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-text-primary)]"
                          : "text-[color:var(--sem-text-secondary)] hover:bg-[color:var(--cmp-surface-panel)]",
                      ].join(" ")}
                    >
                      <p className="font-medium">{customer.full_name}</p>
                      <p className="text-xs">{customer.phone ?? customer.email ?? "No contact"}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : props.isLoadingThread ? (
          <p className="text-sm text-[color:var(--sem-text-secondary)]">
            <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />
            Loading conversation history...
          </p>
        ) : props.orderedTextMessages.length === 0 ? (
          <p className="text-sm text-[color:var(--sem-text-secondary)]">Pick a conversation to see the history.</p>
        ) : (
          <div className="mx-auto max-w-3xl space-y-2">
            {props.orderedTextMessages.map((message) => {
              const isOutbound = message.direction === "outbound";

              return (
                <div key={message.id} className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                  <article
                    className={[
                      "max-w-[min(100%,78%)] rounded-2xl px-4 py-3 text-sm leading-6",
                      isOutbound
                        ? "border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-text-primary)]"
                        : "border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] text-[color:var(--sem-text-primary)]",
                    ].join(" ")}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[color:var(--sem-text-muted)]">
                      <span>{isOutbound ? "Office" : "Customer"}</span>
                      <span>{props.formatTime(message.createdAt)}</span>
                      <span>{props.formatDeliveryStatus(message.deliveryStatus)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-line">{message.body}</p>
                  </article>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {props.composeMode !== "email" ? (
        <div className="shrink-0 border-t border-[color:var(--cmp-border-subtle)] px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">Quick replies</span>
            {props.isLoadingTemplates ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[color:var(--sem-text-muted)]" />
            ) : (
              props.quickTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => props.handleApplyTemplate(template)}
                  className="theme-control-surface max-w-[200px] truncate rounded-full px-3 py-1.5 text-xs"
                  title={template.name}
                >
                  {template.name}
                </button>
              ))
            )}
            <button type="button" onClick={props.openTemplateBank} className="theme-control-surface inline-flex h-8 w-8 items-center justify-center rounded-full" aria-label="Open template bank">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {props.templatesError ? <p className="theme-alert-error mt-2 rounded-[12px] border px-2 py-1 text-xs">{props.templatesError}</p> : null}
        </div>
      ) : null}

      <div className="shrink-0 border-t border-[color:var(--cmp-border-subtle)] p-4">
        {!props.composeMode ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-1">
              <button
                type="button"
                onClick={() => props.setComposerSurfaceMode("customer")}
                className={[
                  "rounded-full px-3 py-1.5 text-xs font-semibold",
                  !isNoteMode ? "bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-text-primary)]" : "text-[color:var(--sem-text-muted)]",
                ].join(" ")}
              >
                Reply to customer
              </button>
              <button
                type="button"
                onClick={() => props.setComposerSurfaceMode("note")}
                className={[
                  "rounded-full px-3 py-1.5 text-xs font-semibold",
                  isNoteMode ? "bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-text-primary)]" : "text-[color:var(--sem-text-muted)]",
                ].join(" ")}
              >
                Internal note
              </button>
            </div>
            <button
              type="button"
              onClick={props.openTemplateBank}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[color:var(--cmp-border-subtle)] px-3 py-1.5 text-xs text-[color:var(--sem-text-secondary)]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI draft · review
            </button>
          </div>
        ) : null}

        <div className={[
          "rounded-2xl border p-3",
          isNoteMode ? "border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-panel)]" : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]",
        ].join(" ")}>
          {isNoteMode ? (
            <>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--sem-text-muted)]">
                <StickyNote className="h-3.5 w-3.5" />
                Internal note
              </div>
              <textarea
                rows={3}
                disabled
                className="theme-input-control min-h-[72px] w-full rounded-[14px] px-3 py-2 text-sm opacity-80"
                placeholder="Internal notes are not stored in SMS yet — use customer profile or job notes."
              />
              <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">Assistive workflow only. Notes do not send to the customer.</p>
            </>
          ) : props.composeMode === "text" ? (
            <div className="flex items-end gap-2">
              <textarea
                value={props.composeTextBody}
                onChange={(event) => props.setComposeTextBody(event.target.value)}
                disabled={props.isComposeSending}
                rows={3}
                className="theme-input-control min-h-[88px] w-full rounded-[14px] px-3 py-2 text-sm"
                placeholder="Type new SMS message..."
              />
              <button
                type="button"
                onClick={() => void props.handleComposeSend()}
                disabled={props.isComposeSending || !props.composeTextBody.trim()}
                className="theme-btn-primary inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-60"
                aria-label="Send new SMS"
              >
                {props.isComposeSending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          ) : props.composeMode === "email" ? (
            <p className="text-sm text-[color:var(--sem-text-secondary)]">Email compose remains preview-only in this workspace.</p>
          ) : (
            <div className="space-y-3">
              <textarea
                value={props.textDraft}
                onChange={(event) => props.setTextDraft(event.target.value)}
                disabled={(props.lane === "customers" ? !props.selectedCustomerId : !props.selectedPhoneKey) || props.isSending}
                rows={3}
                className="theme-input-control min-h-[88px] w-full rounded-[14px] px-3 py-2 text-sm"
                placeholder={props.lane === "customers" ? "Write a reply to the customer..." : "Write a reply to this number..."}
              />
              <div className="flex items-center justify-between gap-2">
                <button type="button" disabled className="theme-control-surface rounded-full p-2 opacity-50" aria-label="Attachments not available" title="Attachments not available">
                  <Paperclip className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void props.handleSend()}
                  disabled={(props.lane === "customers" ? !props.selectedCustomerId : !props.selectedPhoneKey) || props.isSending || !props.textDraft.trim()}
                  className="theme-btn-primary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  {props.isSending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send reply
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function MessagingDashboard({
  initialLane,
  initialCustomerId,
  initialPhoneKey,
  organizationDisplayName,
}: {
  initialLane: Lane;
  initialCustomerId: string | null;
  initialPhoneKey: string | null;
  organizationDisplayName: string;
}) {
  const lastSyncedConversationKeyRef = useRef<string | null>(null);

  const [lane, setLane] = useState<Lane>(initialLane);
  const [isBooting, setIsBooting] = useState(true);
  const [isRefreshingList, setIsRefreshingList] = useState(false);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUpdatingReadState, setIsUpdatingReadState] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<MessagingDashboardResponse>({
    customers: [],
    unknownNumbers: [],
  });
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(initialCustomerId);
  const [selectedPhoneKey, setSelectedPhoneKey] = useState<string | null>(initialPhoneKey);
  const [textThread, setTextThread] = useState<TextThreadResponse>({ unreadCount: 0, items: [] });
  const [textDraft, setTextDraft] = useState("");
  const [smsTemplates, setSmsTemplates] = useState<SmsTemplateItem[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [isTemplateBankOpen, setIsTemplateBankOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [templateSaveError, setTemplateSaveError] = useState<string | null>(null);
  const [templateMutationError, setTemplateMutationError] = useState<string | null>(null);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [templateActionKey, setTemplateActionKey] = useState<string | null>(null);
  const [isLaneIconMode, setIsLaneIconMode] = useState(false);
  const [composeMode, setComposeMode] = useState<"text" | "email" | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [pickerResults, setPickerResults] = useState<CustomerPickerItem[]>([]);
  const [isLoadingPicker, setIsLoadingPicker] = useState(false);
  const [selectedComposeCustomer, setSelectedComposeCustomer] = useState<CustomerPickerItem | null>(null);
  const [composeTextBody, setComposeTextBody] = useState("");
  const [composeEmailSubject, setComposeEmailSubject] = useState("");
  const [composeEmailBody, setComposeEmailBody] = useState("");
  const [composeEmailToOverride, setComposeEmailToOverride] = useState("");
  const [composeError, setComposeError] = useState<string | null>(null);
  const [isComposeSending, setIsComposeSending] = useState(false);
  const [composeDirectRecipient, setComposeDirectRecipient] = useState("");
  const [inboxSearch, setInboxSearch] = useState("");
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [composerSurfaceMode, setComposerSurfaceMode] = useState<ComposerSurfaceMode>("customer");

  const normalizedSearchDigits = useMemo(
    () => customerSearch.replace(/\D/g, ""),
    [customerSearch],
  );

  const filteredPickerResults = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();

    if (!query) {
      return pickerResults;
    }

    return pickerResults.filter((customer) => {
      const name = customer.full_name.toLowerCase();
      const email = (customer.email ?? "").toLowerCase();
      const phoneDigits = (customer.phone ?? "").replace(/\D/g, "");

      if (composeMode === "text") {
        return name.includes(query)
          || phoneDigits.includes(normalizedSearchDigits)
          || email.includes(query);
      }

      return name.includes(query)
        || email.includes(query)
        || phoneDigits.includes(normalizedSearchDigits);
    });
  }, [composeMode, customerSearch, normalizedSearchDigits, pickerResults]);

  const canUseDirectNumber = useMemo(() => {
    if (composeMode !== "text") {
      return false;
    }

    return normalizedSearchDigits.length >= 7;
  }, [composeMode, normalizedSearchDigits]);

  const canUseDirectEmail = useMemo(() => {
    if (composeMode !== "email") {
      return false;
    }

    const trimmed = customerSearch.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  }, [composeMode, customerSearch]);

  const activeRows = lane === "customers"
    ? dashboard.customers
    : dashboard.unknownNumbers;

  const selectedConversation = useMemo(() => {
    if (lane === "customers") {
      return dashboard.customers.find((row) => row.customerId === selectedCustomerId) ?? null;
    }

    return dashboard.unknownNumbers.find((row) => row.phoneKey === selectedPhoneKey) ?? null;
  }, [dashboard.customers, dashboard.unknownNumbers, lane, selectedCustomerId, selectedPhoneKey]);

  const orderedTextMessages = useMemo(() => [...textThread.items].reverse(), [textThread.items]);
  const selectedConversationId = useMemo(() => {
    if (lane === "customers" && selectedCustomerId) {
      return `customer:${selectedCustomerId}`;
    }

    if (lane === "unknown" && selectedPhoneKey) {
      return `phone:${selectedPhoneKey}`;
    }

    return null;
  }, [lane, selectedCustomerId, selectedPhoneKey]);
  const hasInboundMessages = useMemo(
    () => textThread.items.some((message) => message.direction === "inbound"),
    [textThread.items],
  );
  const hasUnreadMessages = textThread.unreadCount > 0 || textThread.items.some((message) => message.unread);
  const quickTemplates = useMemo(
    () => [...smsTemplates]
      .filter((template) => template.quickPickOrder !== null)
      .sort((left, right) => {
        const leftOrder = left.quickPickOrder ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.quickPickOrder ?? Number.MAX_SAFE_INTEGER;

        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      })
      .slice(0, 4),
    [smsTemplates],
  );
  const quickPickCount = quickTemplates.length;
  const templateRecipientName = useMemo(() => {
    if (composeMode === "text") {
      return selectedComposeCustomer?.full_name?.trim() || "there";
    }

    if (lane === "customers") {
      return (selectedConversation as CustomerConversationRow | null)?.customerName?.trim() || "there";
    }

    return "there";
  }, [composeMode, lane, selectedComposeCustomer, selectedConversation]);
  const linkedPlaceholderName = useMemo(() => {
    if (composeMode === "text") {
      return selectedComposeCustomer?.full_name?.trim()
        || (selectedConversation as CustomerConversationRow | null)?.customerName?.trim()
        || "there";
    }

    if (lane === "customers") {
      return (selectedConversation as CustomerConversationRow | null)?.customerName?.trim() || "there";
    }

    return "there";
  }, [composeMode, lane, selectedComposeCustomer, selectedConversation]);
  const placeholderLinkedPreview = `Hi ${linkedPlaceholderName}, this is ${organizationDisplayName}.`;
  const placeholderUnknownPreview = `Hi there, this is ${organizationDisplayName}.`;

  const unifiedRows = useMemo(() => sortConversationRows(buildUnifiedRows(dashboard)), [dashboard]);

  const filteredInboxRows = useMemo(() => {
    const query = inboxSearch.trim().toLowerCase();

    return unifiedRows.filter((row) => {
      if (inboxFilter === "customers" && row.kind !== "customer") {
        return false;
      }

      if (inboxFilter === "unknown" && row.kind !== "unknown") {
        return false;
      }

      if (!query) {
        return true;
      }

      return row.displayName.toLowerCase().includes(query)
        || (row.phoneNumber ?? "").toLowerCase().includes(query)
        || row.lastMessage.toLowerCase().includes(query);
    });
  }, [inboxFilter, inboxSearch, unifiedRows]);

  const inboxUnreadCount = useMemo(
    () => unifiedRows.reduce((total, row) => total + row.unreadCount, 0),
    [unifiedRows],
  );

  const unassignedCount = useMemo(
    () => unifiedRows.filter((row) => row.kind === "unknown").length,
    [unifiedRows],
  );

  function selectUnifiedConversation(row: UnifiedConversationRow) {
    if (row.kind === "customer" && row.customerId) {
      setLane("customers");
      setSelectedCustomerId(row.customerId);
      setSelectedPhoneKey(null);
      return;
    }

    if (row.phoneKey) {
      setLane("unknown");
      setSelectedPhoneKey(row.phoneKey);
      setSelectedCustomerId(null);
    }
  }

  function mergeTemplateBody(currentValue: string, nextValue: string) {
    const trimmedCurrent = currentValue.trimEnd();
    const trimmedNext = nextValue.trim();

    if (!trimmedNext) {
      return trimmedCurrent;
    }

    if (!trimmedCurrent) {
      return trimmedNext;
    }

    return `${trimmedCurrent}\n${trimmedNext}`;
  }

  function applyTemplatePlaceholders(body: string) {
    return body
      .replace(/\{customer\}/gi, templateRecipientName)
      .replace(/\{company\}/gi, organizationDisplayName);
  }

  function openTemplateBank() {
    setIsTemplateBankOpen(true);
    setTemplateSaveError(null);
    setTemplateMutationError(null);
  }

  function closeTemplateBank() {
    setIsTemplateBankOpen(false);
    setTemplateSaveError(null);
    setTemplateMutationError(null);
  }

  function handleApplyTemplate(template: SmsTemplateItem) {
    const nextBody = applyTemplatePlaceholders(template.body);

    if (composeMode === "text") {
      setComposeTextBody((current) => mergeTemplateBody(current, nextBody));
    } else {
      setTextDraft((current) => mergeTemplateBody(current, nextBody));
    }

    closeTemplateBank();
  }

  async function loadCustomerPicker(queryRaw?: string) {
    setIsLoadingPicker(true);

    try {
      const query = (queryRaw ?? customerSearch).trim();
      const queryString = query
        ? `?q=${encodeURIComponent(query)}&page=1&pageSize=20`
        : "?page=1&pageSize=20";
      const payload = await crmApiFetch<CustomersPickerResponse>(`/api/customers${queryString}`);
      setPickerResults(payload.items ?? []);
      setComposeError(null);
    } catch (error) {
      setComposeError(error instanceof Error ? error.message : "Customer search is unavailable.");
      setPickerResults([]);
    } finally {
      setIsLoadingPicker(false);
    }
  }

  function normalizePhoneKey(raw: string) {
    const digits = raw.replace(/\D/g, "").trim();
    return digits.length > 0 ? digits : raw.trim();
  }

  function openComposer(nextMode: "text" | "email") {
    setComposeMode(nextMode);
    setComposerSurfaceMode("customer");
    setCustomerSearch("");
    setPickerResults([]);
    setSelectedComposeCustomer(null);
    setComposeTextBody("");
    setComposeEmailSubject("");
    setComposeEmailBody("");
    setComposeEmailToOverride("");
    setComposeDirectRecipient("");
    setComposeError(null);
    void loadCustomerPicker("");
  }

  function closeComposer() {
    setComposeMode(null);
    setCustomerSearch("");
    setPickerResults([]);
    setSelectedComposeCustomer(null);
    setComposeTextBody("");
    setComposeEmailSubject("");
    setComposeEmailBody("");
    setComposeEmailToOverride("");
    setComposeDirectRecipient("");
    setComposeError(null);
    setIsComposeSending(false);
  }

  async function loadTemplates() {
    setIsLoadingTemplates(true);

    try {
      const payload = await crmApiFetch<SmsTemplatesResponse>("/api/messaging/txt/templates");
      setSmsTemplates(payload.items ?? []);
      setTemplatesError(null);
    } catch (error) {
      setTemplatesError(error instanceof Error ? error.message : "SMS templates are unavailable right now.");
      setSmsTemplates([]);
    } finally {
      setIsLoadingTemplates(false);
    }
  }

  async function handleCreateTemplate() {
    const trimmedName = templateName.trim();
    const trimmedBody = templateBody.trim();

    if (!trimmedName) {
      setTemplateSaveError("Enter a template name.");
      return;
    }

    if (!trimmedBody) {
      setTemplateSaveError("Enter a template body.");
      return;
    }

    setIsCreatingTemplate(true);
    setTemplateSaveError(null);
    setTemplateMutationError(null);

    try {
      await crmApiFetch<SmsTemplateItem>("/api/messaging/txt/templates", {
        method: "POST",
        body: JSON.stringify({
          name: trimmedName,
          body: trimmedBody,
        }),
      });

      setTemplateName("");
      setTemplateBody("");
      await loadTemplates();
    } catch (error) {
      setTemplateSaveError(error instanceof Error ? error.message : "The SMS template could not be created.");
    } finally {
      setIsCreatingTemplate(false);
    }
  }

  async function handleToggleQuickPick(template: SmsTemplateItem) {
    const wantsQuickPick = template.quickPickOrder === null;

    if (wantsQuickPick && quickPickCount >= 4) {
      setTemplateMutationError("Only 4 SMS quick-pick templates can be selected at a time.");
      return;
    }

    setTemplateActionKey(`quick:${template.id}`);
    setTemplateMutationError(null);

    try {
      await crmApiFetch<SmsTemplateItem>(`/api/messaging/txt/templates/${encodeURIComponent(template.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          quickPick: wantsQuickPick,
        }),
      });

      await loadTemplates();
    } catch (error) {
      setTemplateMutationError(error instanceof Error ? error.message : "The quick-pick selection could not be updated.");
    } finally {
      setTemplateActionKey(null);
    }
  }

  async function handleDeactivateTemplate(template: SmsTemplateItem) {
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm(`Deactivate \"${template.name}\"?`);

    if (!confirmed) {
      return;
    }

    setTemplateActionKey(`delete:${template.id}`);
    setTemplateMutationError(null);

    try {
      await crmApiFetch<{ id: string; deactivated: true }>(`/api/messaging/txt/templates/${encodeURIComponent(template.id)}`, {
        method: "DELETE",
      });

      await loadTemplates();
    } catch (error) {
      setTemplateMutationError(error instanceof Error ? error.message : "The SMS template could not be deactivated.");
    } finally {
      setTemplateActionKey(null);
    }
  }

  async function handleComposeSend() {
    if (!composeMode) {
      return;
    }

    if (composeMode === "text") {
      const trimmedBody = composeTextBody.trim();
      const customerPhone = selectedComposeCustomer?.phone?.trim() ?? "";
      const directPhone = composeDirectRecipient.trim();
      const recipientPhone = directPhone || customerPhone;
      const conversationId = selectedComposeCustomer
        ? `customer:${selectedComposeCustomer.id}`
        : `phone:${recipientPhone}`;

      if (!recipientPhone) {
        setComposeError("Search and select a customer phone, or choose New number.");
        return;
      }

      if (!trimmedBody) {
        setComposeError("Enter a text message before sending.");
        return;
      }

      setIsComposeSending(true);
      setComposeError(null);

      try {
        await crmApiFetch<TextThreadResponse>("/api/messaging/txt/send", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            body: trimmedBody,
          }),
        });

        if (selectedComposeCustomer) {
          setLane("customers");
          setSelectedCustomerId(selectedComposeCustomer.id);
        } else {
          setLane("unknown");
          setSelectedPhoneKey(normalizePhoneKey(recipientPhone));
        }

        window.dispatchEvent(new CustomEvent("wizfield:texts-updated"));
        closeComposer();
        void loadDashboard(false);
      } catch (error) {
        setComposeError(error instanceof Error ? error.message : "The text message could not be sent.");
      } finally {
        setIsComposeSending(false);
      }

      return;
    }

    setComposeError("Email messaging is not part of the SMS runtime.");
  }

  async function loadDashboard(showSpinner: boolean) {
    if (showSpinner) {
      setIsBooting(true);
    } else {
      setIsRefreshingList(true);
    }

    try {
      const nextText = await crmApiFetch<MessagingTxtConversationsResponse>("/api/messaging/txt/conversations?limit=120");
      const customerRows: CustomerConversationRow[] = nextText.items
        .filter((item) => item.kind === "customer" && item.customerId)
        .map((item) => ({
          customerId: item.customerId ?? "",
          customerName: item.customerName,
          phoneNumber: item.phoneNumber,
          lastMessage: item.lastMessage,
          lastMessageAt: item.lastMessageAt,
          unreadCount: item.unreadCount,
        }));

      const unknownRows: UnknownConversationRow[] = nextText.items
        .filter((item) => item.kind === "unknown")
        .map((item) => ({
          phoneKey: item.id.startsWith("phone:") ? item.id.slice("phone:".length) : item.id,
          phoneNumber: item.phoneNumber,
          lastMessage: item.lastMessage,
          lastMessageAt: item.lastMessageAt,
          unreadCount: item.unreadCount,
        }));

      setDashboard({
        customers: customerRows,
        unknownNumbers: unknownRows,
      });

      if (!selectedCustomerId && customerRows.length > 0) {
        setSelectedCustomerId(customerRows[0].customerId);
      }

      if (!selectedPhoneKey && unknownRows.length > 0) {
        setSelectedPhoneKey(unknownRows[0].phoneKey);
      }

      setListError(null);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "Messaging data is unavailable right now.");
    } finally {
      setIsBooting(false);
      setIsRefreshingList(false);
    }
  }

  async function loadThread(nextLane: Lane, customerId: string | null, phoneKey: string | null, emailCustomerId: string | null) {
    setIsLoadingThread(true);
    setThreadError(null);

    try {
      if (nextLane === "customers" && customerId) {
        const conversationId = `customer:${customerId}`;
        const payload = await crmApiFetch<TextThreadResponse>(`/api/messaging/txt/conversations/${encodeURIComponent(conversationId)}/messages?limit=200`);

        if (payload.unreadCount > 0) {
          const markedRead = await crmApiFetch<TextThreadResponse>(`/api/messaging/txt/conversations/${encodeURIComponent(conversationId)}/messages/mark-read`, {
            method: "POST",
          });
          setTextThread(markedRead);
          void loadDashboard(false);
        } else {
          setTextThread(payload);
        }

        return;
      }

      if (nextLane === "unknown" && phoneKey) {
        const conversationId = `phone:${phoneKey}`;
        const payload = await crmApiFetch<TextThreadResponse>(`/api/messaging/txt/conversations/${encodeURIComponent(conversationId)}/messages?limit=400`);

        if (payload.unreadCount > 0) {
          const markedRead = await crmApiFetch<TextThreadResponse>(`/api/messaging/txt/conversations/${encodeURIComponent(conversationId)}/messages/mark-read`, {
            method: "POST",
          });
          setTextThread(markedRead);
          void loadDashboard(false);
        } else {
          setTextThread(payload);
        }

        return;
      }

      setTextThread({ unreadCount: 0, items: [] });
    } catch (error) {
      setThreadError(error instanceof Error ? error.message : "Conversation history is unavailable.");
      setTextThread({ unreadCount: 0, items: [] });
    } finally {
      setIsLoadingThread(false);
    }
  }

  useEffect(() => {
    setLane(initialLane);
    setSelectedCustomerId(initialLane === "customers" ? initialCustomerId : null);
    setSelectedPhoneKey(initialLane === "unknown" ? initialPhoneKey : null);
    lastSyncedConversationKeyRef.current = null;
  }, [initialLane, initialCustomerId, initialPhoneKey]);

  useEffect(() => {
    void loadDashboard(true);
    void loadTemplates();
  }, []);

  useEffect(() => {
    if (lane === "customers" && !selectedCustomerId && dashboard.customers.length > 0) {
      setSelectedCustomerId(dashboard.customers[0].customerId);
    }

    if (lane === "unknown" && !selectedPhoneKey && dashboard.unknownNumbers.length > 0) {
      setSelectedPhoneKey(dashboard.unknownNumbers[0].phoneKey);
    }

  }, [dashboard.customers, dashboard.unknownNumbers, lane, selectedCustomerId, selectedPhoneKey]);

  useEffect(() => {
    if (lane === "customers" && selectedCustomerId) {
      const hasSelection = dashboard.customers.some((row) => row.customerId === selectedCustomerId);

      if (!hasSelection) {
        setSelectedCustomerId(dashboard.customers[0]?.customerId ?? null);
      }
    }

    if (lane === "unknown" && selectedPhoneKey) {
      const hasSelection = dashboard.unknownNumbers.some((row) => row.phoneKey === selectedPhoneKey);

      if (!hasSelection) {
        setSelectedPhoneKey(dashboard.unknownNumbers[0]?.phoneKey ?? null);
      }
    }

  }, [dashboard.customers, dashboard.unknownNumbers, lane, selectedCustomerId, selectedPhoneKey]);

  useEffect(() => {
    if (lane === "customers") {
      void loadThread("customers", selectedCustomerId, null, null);
      return;
    }

    void loadThread("unknown", null, selectedPhoneKey, null);
  }, [lane, selectedCustomerId, selectedPhoneKey]);

  useEffect(() => {
    if (composeMode) {
      return;
    }

    const payload = lane === "unknown"
      ? selectedPhoneKey
        ? {
          lane: "unknown" as const,
          customerId: undefined,
          phoneKey: selectedPhoneKey,
        }
        : null
      : selectedCustomerId
          ? {
            lane: "customers" as const,
            customerId: selectedCustomerId,
            phoneKey: undefined,
          }
          : null;

    if (!payload) {
      return;
    }

    const conversationKey = payload.lane === "unknown"
      ? `${payload.lane}:${payload.phoneKey}`
      : `${payload.lane}:${payload.customerId}`;

    if (lastSyncedConversationKeyRef.current === conversationKey) {
      return;
    }

    lastSyncedConversationKeyRef.current = conversationKey;
    let active = true;

    async function syncConversationUrl() {
      try {
        const shortLink = await crmApiFetch<MessagingShortLinkResponse>("/api/messaging/conversations/short-link", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (!active) {
          return;
        }

        const publicCode = shortLink.publicConversationCode ?? shortLink.shortId;

        if (!publicCode) {
          return;
        }

        const nextPath = `/messaging/${publicCode}`;

        if (window.location.pathname !== nextPath) {
          window.history.replaceState(window.history.state, "", nextPath);
        }
      } catch {
        // Keep existing URL when short-link creation fails.
      }
    }

    void syncConversationUrl();

    return () => {
      active = false;
    };
  }, [composeMode, lane, selectedCustomerId, selectedPhoneKey]);

  useEffect(() => {
    if (!composeMode) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadCustomerPicker(customerSearch);
    }, 220);

    return () => window.clearTimeout(timeoutId);
  }, [composeMode, customerSearch]);

  async function handleSend() {
    if (lane === "customers") {
      if (!selectedCustomerId) {
        return;
      }

      const trimmed = textDraft.trim();

      if (!trimmed) {
        setThreadError("Enter a message before sending.");
        return;
      }

      setIsSending(true);
      setThreadError(null);

      try {
        const next = await crmApiFetch<TextThreadResponse>("/api/messaging/txt/send", {
          method: "POST",
          body: JSON.stringify({
            conversationId: `customer:${selectedCustomerId}`,
            body: trimmed,
          }),
        });

        setTextThread(next);
        setTextDraft("");
        window.dispatchEvent(new CustomEvent("wizfield:texts-updated"));
        void loadDashboard(false);
      } catch (error) {
        setThreadError(error instanceof Error ? error.message : "The text message could not be sent.");
      } finally {
        setIsSending(false);
      }

      return;
    }

    if (lane === "unknown") {
      if (!selectedPhoneKey) {
        return;
      }

      const trimmed = textDraft.trim();

      if (!trimmed) {
        setThreadError("Enter a message before sending.");
        return;
      }

      setIsSending(true);
      setThreadError(null);

      try {
        const next = await crmApiFetch<TextThreadResponse>("/api/messaging/txt/send", {
          method: "POST",
          body: JSON.stringify({
            conversationId: `phone:${selectedPhoneKey}`,
            body: trimmed,
          }),
        });

        setTextThread(next);
        setTextDraft("");
        window.dispatchEvent(new CustomEvent("wizfield:texts-updated"));
        void loadDashboard(false);
      } catch (error) {
        setThreadError(error instanceof Error ? error.message : "The text message could not be sent.");
      } finally {
        setIsSending(false);
      }

      return;
    }

    return;
  }

  async function updateReadState(nextAction: "read" | "unread") {
    if (!selectedConversationId) {
      return;
    }

    setIsUpdatingReadState(true);
    setThreadError(null);

    try {
      const next = await crmApiFetch<TextThreadResponse>(
        `/api/messaging/txt/conversations/${encodeURIComponent(selectedConversationId)}/messages/mark-${nextAction}`,
        {
          method: "POST",
        },
      );

      setTextThread(next);
      window.dispatchEvent(new CustomEvent("wizfield:texts-updated"));
      void loadDashboard(false);
    } catch (error) {
      setThreadError(error instanceof Error ? error.message : `The conversation could not be marked as ${nextAction}.`);
    } finally {
      setIsUpdatingReadState(false);
    }
  }

  return (
    <>
      {!SHOW_LEGACY_MESSAGING_LAYOUT ? (
        <div className="flex h-[calc(100dvh-4.75rem)] min-h-[640px] flex-col overflow-hidden text-[color:var(--sem-text-primary)]">
          <header className={`${deskPanelClass} mx-3 mt-3 flex shrink-0 flex-wrap items-center justify-between gap-4 rounded-[24px] px-5 py-4 lg:mx-4`}>
            <div>
              <p className={deskEyebrowClass}>WizField Communication Desk</p>
              <h1 className="text-xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">Messaging Command Center</h1>
              <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">
                Move threads toward booking, payment, and task completion — not a passive inbox.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="hidden text-xs text-[color:var(--sem-text-muted)] lg:block">
                {unifiedRows.length} threads · {inboxUnreadCount} unread · {unassignedCount} unassigned numbers
              </p>
              <button
                type="button"
                onClick={() => void loadDashboard(false)}
                className="theme-btn-secondary rounded-full px-4 py-2 text-sm"
                disabled={isBooting || isRefreshingList}
              >
                {isRefreshingList ? "Refreshing..." : "Refresh"}
              </button>
              <button
                type="button"
                onClick={() => openComposer("text")}
                className="theme-btn-primary rounded-full px-4 py-2 text-sm font-semibold"
              >
                New message
              </button>
            </div>
          </header>

          {listError ? (
            <div className="theme-alert-error mx-4 mt-3 rounded-[18px] border px-4 py-3 text-sm">{listError}</div>
          ) : null}

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 pt-3 lg:grid-cols-[minmax(260px,0.72fr)_minmax(0,1.85fr)_minmax(240px,0.62fr)] lg:gap-0 lg:p-4">
            <aside className={`${deskPanelClass} flex min-h-0 flex-col overflow-hidden rounded-[24px] lg:mr-2`}>
              <div className="shrink-0 border-b border-[color:var(--cmp-border-subtle)] p-4">
                <label className="flex items-center gap-2 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-2 text-sm text-[color:var(--sem-text-muted)]">
                  <Search className="h-4 w-4 shrink-0" />
                  <input
                    type="search"
                    value={inboxSearch}
                    onChange={(event) => setInboxSearch(event.target.value)}
                    placeholder="Search conversations..."
                    className="w-full bg-transparent text-sm text-[color:var(--sem-text-primary)] outline-none placeholder:text-[color:var(--sem-text-muted)]"
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  {([
                    ["all", "All"],
                    ["customers", "Linked customers"],
                    ["unknown", "Unassigned numbers"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setInboxFilter(value)}
                      className={[
                        "rounded-full border px-3 py-1.5 text-[11px] font-medium transition",
                        inboxFilter === value
                          ? "border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-text-primary)]"
                          : "border-[color:var(--cmp-border-subtle)] text-[color:var(--sem-text-secondary)] hover:text-[color:var(--sem-text-primary)]",
                      ].join(" ")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {isBooting ? (
                  <p className="px-2 py-4 text-sm text-[color:var(--sem-text-secondary)]">
                    <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />
                    Loading inbox...
                  </p>
                ) : filteredInboxRows.length === 0 ? (
                  <p className="px-2 py-4 text-sm text-[color:var(--sem-text-secondary)]">No conversations match this view.</p>
                ) : (
                  <div className="space-y-1">
                    {filteredInboxRows.map((row) => {
                      const active = isUnifiedRowActive(row, lane, selectedCustomerId, selectedPhoneKey);
                      const unread = row.unreadCount > 0;

                      return (
                        <button
                          key={row.key}
                          type="button"
                          onClick={() => selectUnifiedConversation(row)}
                          className={[
                            "w-full rounded-xl px-3 py-3 text-left transition",
                            active
                              ? "bg-[color:var(--cmp-surface-soft)] ring-1 ring-[color:var(--cmp-border-accent)]"
                              : unread
                                ? "bg-[color:var(--cmp-surface-panel)] hover:bg-[color:var(--cmp-surface-soft)]"
                                : "hover:bg-[color:var(--cmp-surface-panel)]",
                          ].join(" ")}
                        >
                          <div className="flex items-start gap-3">
                            <span className="mt-1.5 flex h-2 w-2 shrink-0 justify-center">
                              {unread ? <span className="h-2 w-2 rounded-full bg-[color:var(--sem-accent-primary)]" /> : null}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className={`truncate text-sm ${unread ? "font-semibold text-[color:var(--sem-text-primary)]" : "font-medium text-[color:var(--sem-text-secondary)]"}`}>
                                  {row.displayName}
                                </p>
                                <span className="shrink-0 text-[11px] tabular-nums text-[color:var(--sem-text-muted)]">{formatRelativeTime(row.lastMessageAt)}</span>
                              </div>
                              <p className={`mt-1 line-clamp-2 text-xs leading-5 ${unread ? "text-[color:var(--sem-text-secondary)]" : "text-[color:var(--sem-text-muted)]"}`}>
                                {row.lastMessage}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>

            <main className={`${deskPanelClass} flex min-h-0 flex-col overflow-hidden rounded-[24px] lg:mx-1`}>
              <DeskThreadPanel
                composeMode={composeMode}
                closeComposer={closeComposer}
                composeError={composeError}
                composeModeText={composeMode === "text"}
                customerSearch={customerSearch}
                setCustomerSearch={setCustomerSearch}
                isLoadingPicker={isLoadingPicker}
                filteredPickerResults={filteredPickerResults}
                selectedComposeCustomer={selectedComposeCustomer}
                setSelectedComposeCustomer={setSelectedComposeCustomer}
                composeDirectRecipient={composeDirectRecipient}
                setComposeDirectRecipient={setComposeDirectRecipient}
                canUseDirectNumber={canUseDirectNumber}
                canUseDirectEmail={canUseDirectEmail}
                normalizedSearchDigits={normalizedSearchDigits}
                composeEmailToOverride={composeEmailToOverride}
                setComposeEmailToOverride={setComposeEmailToOverride}
                lane={lane}
                selectedConversation={selectedConversation}
                selectedCustomerId={selectedCustomerId}
                selectedPhoneKey={selectedPhoneKey}
                selectedConversationId={selectedConversationId}
                textThread={textThread}
                hasUnreadMessages={hasUnreadMessages}
                hasInboundMessages={hasInboundMessages}
                isUpdatingReadState={isUpdatingReadState}
                isLoadingThread={isLoadingThread}
                threadError={threadError}
                orderedTextMessages={orderedTextMessages}
                updateReadState={updateReadState}
                quickTemplates={quickTemplates}
                isLoadingTemplates={isLoadingTemplates}
                templatesError={templatesError}
                openTemplateBank={openTemplateBank}
                handleApplyTemplate={handleApplyTemplate}
                composerSurfaceMode={composerSurfaceMode}
                setComposerSurfaceMode={setComposerSurfaceMode}
                composeTextBody={composeTextBody}
                setComposeTextBody={setComposeTextBody}
                composeEmailSubject={composeEmailSubject}
                setComposeEmailSubject={setComposeEmailSubject}
                composeEmailBody={composeEmailBody}
                setComposeEmailBody={setComposeEmailBody}
                isComposeSending={isComposeSending}
                handleComposeSend={handleComposeSend}
                textDraft={textDraft}
                setTextDraft={setTextDraft}
                isSending={isSending}
                handleSend={handleSend}
                formatTime={formatTime}
                formatDeliveryStatus={formatDeliveryStatus}
              />
            </main>

            <aside className={`${deskPanelClass} hidden min-h-0 flex-col overflow-hidden rounded-[24px] lg:ml-2 lg:flex`}>
              <div className="shrink-0 border-b border-[color:var(--cmp-border-subtle)] px-4 py-3">
                <p className={deskEyebrowClass}>CRM context</p>
                <h2 className="text-sm font-semibold text-[color:var(--sem-text-primary)]">Customer snapshot</h2>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-hidden px-4 py-3">
                <div className="rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-3">
                  <p className="truncate text-sm font-semibold text-[color:var(--sem-text-primary)]">
                    {composeMode
                      ? selectedComposeCustomer?.full_name ?? "New conversation"
                      : lane === "customers"
                        ? (selectedConversation as CustomerConversationRow | null)?.customerName ?? "Select a thread"
                        : (selectedConversation as UnknownConversationRow | null)?.phoneNumber
                          ?? (selectedConversation as UnknownConversationRow | null)?.phoneKey
                          ?? "Select a thread"}
                  </p>
                  <p className="mt-1 truncate text-xs text-[color:var(--sem-text-muted)]">
                    {lane === "customers" ? "Linked customer" : "Unassigned number"}
                  </p>
                  <div className="mt-3 space-y-2 text-xs text-[color:var(--sem-text-secondary)]">
                    <p className="flex items-center gap-2 truncate"><Phone className="h-3.5 w-3.5 shrink-0 text-[color:var(--sem-text-muted)]" />{(selectedConversation as CustomerConversationRow | UnknownConversationRow | null)?.phoneNumber ?? "No phone on thread"}</p>
                    {lane === "customers" && selectedCustomerId ? (
                      <p className="flex items-center gap-2 truncate"><Mail className="h-3.5 w-3.5 shrink-0 text-[color:var(--sem-text-muted)]" />Open profile for email & company</p>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-xl border border-dashed border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Linked operations</p>
                  <p className="mt-2 text-xs leading-5 text-[color:var(--sem-text-secondary)]">Jobs, invoices, and tasks will surface here when linked to messaging.</p>
                </div>
                <div className="rounded-xl border border-dashed border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-3">
                  <div className="flex items-start gap-2">
                    <Bot className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--sem-text-muted)]" />
                    <div>
                      <p className="text-xs font-medium text-[color:var(--sem-text-primary)]">AI assist · review required</p>
                      <p className="mt-1 text-[11px] leading-5 text-[color:var(--sem-text-muted)]">Suggested replies and summaries assist operators. Nothing sends without human approval.</p>
                      <button
                        type="button"
                        onClick={openTemplateBank}
                        className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-[color:var(--sem-accent-primary)]"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Open draft templates
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="shrink-0 border-t border-[color:var(--cmp-border-subtle)] p-4">
                {lane === "customers" && selectedCustomerId ? (
                  <Link
                    href={`/customers/${selectedCustomerId}`}
                    className="theme-btn-secondary flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold"
                  >
                    Open full customer profile
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <p className="text-center text-xs text-[color:var(--sem-text-muted)]">Link a customer to open the full CRM profile.</p>
                )}
              </div>
            </aside>
          </div>

          {lane === "customers" && selectedCustomerId ? (
            <div className="shrink-0 border-t border-[color:var(--cmp-border-subtle)] px-4 py-3 lg:hidden">
              <Link
                href={`/customers/${selectedCustomerId}`}
                className="theme-btn-secondary flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
              >
                Open full customer profile
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {SHOW_LEGACY_MESSAGING_LAYOUT ? (
    <section className="theme-surface-modal rounded-[32px] border border-[color:rgba(212,175,55,0.2)] bg-[linear-gradient(170deg,rgba(8,8,8,0.96),rgba(19,19,19,0.9))] p-5 shadow-[0_36px_120px_rgba(0,0,0,0.4)] sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--flat-gold)]">Messaging</p>
          <h1 className="mt-3 text-3xl font-semibold text-[color:var(--text-primary)]">Internal SMS messaging hub</h1>
          <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
            Keep customer and unknown-number TXT threads in one reliable workspace.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadDashboard(false)}
          className="theme-btn-secondary inline-flex items-center justify-center rounded-full px-4 py-2 text-sm"
          disabled={isBooting || isRefreshingList}
        >
          {isRefreshingList ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {listError ? (
        <div className="theme-alert-error mt-5 rounded-[18px] border px-4 py-3 text-sm">
          {listError}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 xl:h-[calc(100vh-15rem)] xl:min-h-[640px] xl:grid-cols-[220px_360px_minmax(0,1fr)]">
        <aside className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[linear-gradient(180deg,rgba(20,20,20,0.92),rgba(12,12,12,0.92))] p-3 xl:min-h-0 xl:overflow-auto">
          <p className="px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Choose Lane</p>

          <button
            type="button"
            onClick={() => setIsLaneIconMode((current) => !current)}
            className="theme-control-surface mt-2 w-full rounded-[16px] px-4 py-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-secondary)]"
          >
            {isLaneIconMode ? "Text mode" : "Icon mode"}
          </button>

          <p className="mt-3 px-3 text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Text</p>
          <div className="mt-2 space-y-2">
            <button
              type="button"
              onClick={() => setLane("customers")}
              className={`w-full rounded-[16px] transition ${lane === "customers" ? "bg-[color:var(--button-secondary-bg)] text-[color:var(--text-primary)]" : "theme-control-surface text-[color:var(--text-secondary)]"} ${isLaneIconMode ? "inline-flex h-12 items-center justify-center px-2" : "px-4 py-3 text-left text-sm"}`}
              title="Text customers"
              aria-label="Text customers"
            >
              {isLaneIconMode ? (
                <MessageSquare className="h-5 w-5" />
              ) : (
                <>
                  <p className="font-semibold">1 Text customers</p>
                  <p className="mt-1 text-xs opacity-80">Linked customer SMS conversations</p>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setLane("unknown")}
              className={`w-full rounded-[16px] transition ${lane === "unknown" ? "bg-[color:var(--button-secondary-bg)] text-[color:var(--text-primary)]" : "theme-control-surface text-[color:var(--text-secondary)]"} ${isLaneIconMode ? "inline-flex h-12 items-center justify-center px-2" : "px-4 py-3 text-left text-sm"}`}
              title="Unknown numbers"
              aria-label="Unknown numbers"
            >
              {isLaneIconMode ? (
                <Phone className="h-5 w-5" />
              ) : (
                <>
                  <p className="font-semibold">2 Text unknown numbers</p>
                  <p className="mt-1 text-xs opacity-80">No customer link yet, always visible</p>
                </>
              )}
            </button>
          </div>

        </aside>

        <section className="theme-surface-card flex min-h-[320px] flex-col rounded-[24px] p-3 xl:min-h-0">
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
              {lane === "customers"
                ? "Text Customer Conversations"
                : "Text Unknown Number Conversations"}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openComposer("text")}
                className="theme-btn-secondary inline-flex h-8 w-8 items-center justify-center rounded-full"
                aria-label="New SMS conversation"
                title="New SMS"
              >
                <MessageSquare className="h-4 w-4" />
              </button>
              <span className="text-xs text-[color:var(--text-secondary)]">{activeRows.length}</span>
            </div>
          </div>

          {isBooting ? (
            <div className="px-3 py-6 text-sm text-[color:var(--text-secondary)]">
              <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />
              Loading messaging dashboard...
            </div>
          ) : activeRows.length === 0 ? (
            <div className="px-3 py-6 text-sm text-[color:var(--text-secondary)]">No conversation history yet in this lane.</div>
          ) : (
            <div className="mt-2 space-y-1 xl:min-h-0 xl:flex-1 xl:overflow-auto">
              {lane === "customers"
                ? dashboard.customers.map((row) => {
                  const active = row.customerId === selectedCustomerId;
                  const hasUnread = row.unreadCount > 0;

                  return (
                    <button
                      key={row.customerId}
                      type="button"
                      onClick={() => setSelectedCustomerId(row.customerId)}
                      className={`w-full rounded-[14px] border px-3 py-3 text-left transition ${active ? "border-[color:var(--button-secondary-border)] bg-[color:var(--button-secondary-bg)]" : hasUnread ? "border-[color:var(--flat-gold)] bg-[color:rgba(212,175,55,0.08)]" : "border-transparent hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--bg-soft)]"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-sm text-[color:var(--text-primary)] ${hasUnread ? "font-bold" : "font-semibold"}`}>{row.customerName ?? "Unknown customer"}</p>
                        <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">{formatTime(row.lastMessageAt)}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-[color:var(--text-secondary)]">{row.phoneNumber ?? "No phone"}</p>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[color:var(--text-secondary)]">{row.lastMessage}</p>
                      {row.unreadCount > 0 ? (
                        <span className="mt-2 inline-flex rounded-full bg-[color:var(--flat-gold)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--bg-canvas)]">
                          {row.unreadCount} unread
                        </span>
                      ) : null}
                    </button>
                  );
                })
                : dashboard.unknownNumbers.map((row) => {
                  const active = row.phoneKey === selectedPhoneKey;
                  const hasUnread = row.unreadCount > 0;

                  return (
                    <button
                      key={row.phoneKey}
                      type="button"
                      onClick={() => setSelectedPhoneKey(row.phoneKey)}
                      className={`w-full rounded-[14px] border px-3 py-3 text-left transition ${active ? "border-[color:var(--button-secondary-border)] bg-[color:var(--button-secondary-bg)]" : hasUnread ? "border-[color:var(--flat-gold)] bg-[color:rgba(212,175,55,0.08)]" : "border-transparent hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--bg-soft)]"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-sm text-[color:var(--text-primary)] ${hasUnread ? "font-bold" : "font-semibold"}`}>{row.phoneNumber ?? row.phoneKey}</p>
                        <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">{formatTime(row.lastMessageAt)}</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[color:var(--text-secondary)]">{row.lastMessage}</p>
                      {row.unreadCount > 0 ? (
                        <span className="mt-2 inline-flex rounded-full bg-[color:var(--flat-gold)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--bg-canvas)]">
                          {row.unreadCount} unread
                        </span>
                      ) : null}
                    </button>
                  );
                  })}
            </div>
          )}
        </section>

        <section className="theme-surface-card flex min-h-[560px] flex-col rounded-[24px] p-4 xl:min-h-0 xl:h-full">
          <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border-subtle)] pb-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
                {composeMode ? "New conversation" : "Conversation"}
              </p>
              <p className="mt-1 truncate text-base font-semibold text-[color:var(--text-primary)]">
                {composeMode
                  ? composeMode === "text"
                    ? "New SMS"
                    : "New email"
                  : lane === "customers"
                    ? (selectedConversation as CustomerConversationRow | null)?.customerName ?? "Select a customer"
                    : (selectedConversation as UnknownConversationRow | null)?.phoneNumber
                      ?? (selectedConversation as UnknownConversationRow | null)?.phoneKey
                      ?? "Select a number"}
              </p>
              {!composeMode && lane === "customers" && selectedCustomerId ? (
                <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
                  <Link href={`/customers/${selectedCustomerId}`} className="underline-offset-2 hover:underline">
                    Open customer profile
                  </Link>
                </p>
              ) : null}
              {!composeMode && textThread.unreadCount > 0 ? (
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--flat-gold)]">
                  {textThread.unreadCount} unread
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {!composeMode && selectedConversationId ? (
                <>
                  <button
                    type="button"
                    onClick={() => void updateReadState("read")}
                    disabled={isUpdatingReadState || isLoadingThread || !hasUnreadMessages}
                    className="theme-control-surface rounded-full px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Mark as read
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateReadState("unread")}
                    disabled={isUpdatingReadState || isLoadingThread || !hasInboundMessages}
                    className="theme-control-surface rounded-full px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Mark as unread
                  </button>
                </>
              ) : null}
              {composeMode ? (
                <button
                  type="button"
                  onClick={closeComposer}
                  className="theme-control-surface rounded-full px-3 py-1 text-xs"
                >
                  Close
                </button>
              ) : null}
              <MessageSquare className="h-5 w-5 text-[color:var(--flat-gold)]" />
            </div>
          </div>

          {threadError ? (
            <div className="theme-alert-error mt-4 rounded-[16px] border px-3 py-2 text-sm">{threadError}</div>
          ) : null}

          {composeMode ? (
            <div className="mt-4 flex-1 overflow-auto rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:rgba(255,255,255,0.02)] p-3">
              <label className="block">
                <span className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                  {composeMode === "text" ? "Search customer or type number" : "Search customer or type email"}
                </span>
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  className="theme-input-control h-11 w-full rounded-[14px] px-3 text-sm"
                  placeholder={composeMode === "text" ? "Start typing phone number..." : "Start typing email..."}
                />
              </label>

              <div className="mt-3 max-h-52 overflow-auto rounded-[14px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas)] p-2">
                {isLoadingPicker ? (
                  <p className="text-sm text-[color:var(--text-secondary)]">
                    <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />
                    Searching customers...
                  </p>
                ) : (
                  <div className="space-y-1">
                    {filteredPickerResults.map((customer) => {
                      const active = selectedComposeCustomer?.id === customer.id && !composeDirectRecipient;
                      return (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => {
                            setSelectedComposeCustomer(customer);
                            setComposeDirectRecipient("");
                            if (composeMode === "email") {
                              setComposeEmailToOverride(customer.email ?? "");
                            }
                          }}
                          className={`w-full rounded-[12px] border px-3 py-2 text-left text-sm transition ${active ? "border-[color:var(--button-secondary-border)] bg-[color:var(--button-secondary-bg)]" : "border-transparent hover:border-[color:var(--border-subtle)]"}`}
                        >
                          <p className="font-semibold text-[color:var(--text-primary)]">{customer.full_name}</p>
                          <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
                            {customer.phone ?? "No phone"} | {customer.email ?? "No email"}
                          </p>
                        </button>
                      );
                    })}

                    {canUseDirectNumber ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedComposeCustomer(null);
                          setComposeDirectRecipient(customerSearch.trim());
                        }}
                        className={`w-full rounded-[12px] border px-3 py-2 text-left text-sm transition ${composeDirectRecipient ? "border-[color:var(--button-secondary-border)] bg-[color:var(--button-secondary-bg)]" : "border-transparent hover:border-[color:var(--border-subtle)]"}`}
                      >
                        <p className="font-semibold text-[color:var(--text-primary)]">New number</p>
                        <p className="mt-1 text-xs text-[color:var(--text-secondary)]">Use {customerSearch.trim()} for a new TXT conversation</p>
                      </button>
                    ) : null}

                    {canUseDirectEmail ? (
                      <button
                        type="button"
                        onClick={() => {
                          const value = customerSearch.trim();
                          setSelectedComposeCustomer(null);
                          setComposeDirectRecipient(value);
                          setComposeEmailToOverride(value);
                        }}
                        className={`w-full rounded-[12px] border px-3 py-2 text-left text-sm transition ${composeDirectRecipient ? "border-[color:var(--button-secondary-border)] bg-[color:var(--button-secondary-bg)]" : "border-transparent hover:border-[color:var(--border-subtle)]"}`}
                      >
                        <p className="font-semibold text-[color:var(--text-primary)]">New email</p>
                        <p className="mt-1 text-xs text-[color:var(--text-secondary)]">Use {customerSearch.trim()} as recipient</p>
                      </button>
                    ) : null}

                    {!isLoadingPicker && filteredPickerResults.length === 0 && !canUseDirectNumber && !canUseDirectEmail ? (
                      <p className="px-1 py-2 text-sm text-[color:var(--text-secondary)]">No matching customers found.</p>
                    ) : null}
                  </div>
                )}
              </div>

              {selectedComposeCustomer || composeDirectRecipient ? (
                <div className="mt-3 rounded-[14px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-soft)] p-3 text-sm text-[color:var(--text-secondary)]">
                  <p className="font-semibold text-[color:var(--text-primary)]">
                    {selectedComposeCustomer?.full_name ?? (composeMode === "text" ? "New number" : "New email recipient")}
                  </p>
                  <p className="mt-1">
                    {composeMode === "text"
                      ? `Phone: ${composeDirectRecipient || selectedComposeCustomer?.phone || "No phone"}`
                      : `Email: ${composeDirectRecipient || composeEmailToOverride || selectedComposeCustomer?.email || "No email"}`}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 flex-1 overflow-auto rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:rgba(255,255,255,0.02)] p-3">
              {isLoadingThread ? (
                <p className="text-sm text-[color:var(--text-secondary)]">
                  <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />
                  Loading conversation history...
                </p>
              ) : orderedTextMessages.length === 0 ? (
                <p className="text-sm text-[color:var(--text-secondary)]">Pick a conversation to see the history.</p>
              ) : (
                <div className="space-y-3">
                  {orderedTextMessages.map((message) => {
                    const isOutbound = message.direction === "outbound";

                    return (
                      <div key={message.id} className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                        <article
                          className={`max-w-[min(100%,78%)] rounded-[22px] px-4 py-3 ${isOutbound ? "bg-emerald-600 text-white" : "border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas)] text-[color:var(--text-primary)]"}`}
                        >
                          <div className={`flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em] ${isOutbound ? "text-emerald-100" : "text-[color:var(--text-muted)]"}`}>
                            <span>{isOutbound ? "Office" : "Sender"}</span>
                            <span>{formatTime(message.createdAt)}</span>
                            <span>{formatDeliveryStatus(message.deliveryStatus)}</span>
                            {message.unread ? <span>Unread</span> : null}
                          </div>
                          <p className="mt-2 whitespace-pre-line text-sm leading-6">{message.body}</p>
                        </article>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {composeMode !== "email" ? (
            <div className="mt-3 rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:rgba(255,255,255,0.02)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="mr-1 text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Quick Picks</p>
                {isLoadingTemplates ? (
                  <span className="text-xs text-[color:var(--text-secondary)]">
                    <LoaderCircle className="mr-2 inline h-3.5 w-3.5 animate-spin" />
                    Loading...
                  </span>
                ) : quickTemplates.length > 0 ? (
                  quickTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => handleApplyTemplate(template)}
                      className="theme-control-surface inline-flex max-w-[220px] items-center rounded-full px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)]"
                      title={template.name}
                    >
                      <span className="truncate">{template.name}</span>
                    </button>
                  ))
                ) : (
                  <span className="text-xs text-[color:var(--text-secondary)]">Choose up to 4 SMS quick picks.</span>
                )}

                <button
                  type="button"
                  onClick={openTemplateBank}
                  className="theme-control-surface inline-flex h-8 w-8 items-center justify-center rounded-full"
                  aria-label="Open SMS template bank"
                  title="Open SMS template bank"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {templatesError ? (
                <div className="theme-alert-error mt-3 rounded-[14px] border px-3 py-2 text-sm">{templatesError}</div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:rgba(255,255,255,0.02)] p-3">
            {composeMode === "text" ? (
              <div className="flex items-end gap-2">
                <textarea
                  value={composeTextBody}
                  onChange={(event) => setComposeTextBody(event.target.value)}
                  disabled={isComposeSending}
                  rows={4}
                  className="theme-input-control min-h-[120px] w-full rounded-[14px] px-3 py-2 text-sm"
                  placeholder="Type new SMS message..."
                />
                <button
                  type="button"
                  onClick={() => void handleComposeSend()}
                  disabled={isComposeSending || !composeTextBody.trim()}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Send new SMS"
                  title="Send new SMS"
                >
                  {isComposeSending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            ) : composeMode === "email" ? (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">To email</span>
                  <input
                    type="email"
                    value={composeEmailToOverride}
                    onChange={(event) => {
                      setComposeEmailToOverride(event.target.value);
                      setComposeDirectRecipient(event.target.value.trim());
                    }}
                    disabled={isComposeSending}
                    className="theme-input-control h-11 w-full rounded-[14px] px-3 text-sm"
                    placeholder={selectedComposeCustomer?.email ?? "customer@example.com"}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Subject</span>
                  <input
                    type="text"
                    value={composeEmailSubject}
                    onChange={(event) => setComposeEmailSubject(event.target.value)}
                    disabled={isComposeSending}
                    className="theme-input-control h-11 w-full rounded-[14px] px-3 text-sm"
                    placeholder="Inspection follow-up"
                  />
                </label>

                <div className="flex items-end gap-2">
                  <textarea
                    value={composeEmailBody}
                    onChange={(event) => setComposeEmailBody(event.target.value)}
                    rows={4}
                    disabled={isComposeSending}
                    className="theme-input-control min-h-[120px] w-full rounded-[14px] px-3 py-2 text-sm"
                    placeholder="Type new email..."
                  />
                  <button
                    type="button"
                    onClick={() => void handleComposeSend()}
                    disabled={isComposeSending || !composeEmailBody.trim()}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Send new email"
                    title="Send new email"
                  >
                    {isComposeSending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ) : lane === "customers" ? (
              <div className="flex items-end gap-2">
                <textarea
                  value={textDraft}
                  onChange={(event) => setTextDraft(event.target.value)}
                  disabled={!selectedCustomerId || isSending}
                  rows={4}
                  className="theme-input-control min-h-[120px] w-full rounded-[14px] px-3 py-2 text-sm"
                  placeholder={selectedCustomerId ? "Type an SMS reply..." : "Select a customer conversation first."}
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!selectedCustomerId || isSending || !textDraft.trim()}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Send message"
                  title="Send"
                >
                  {isSending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <textarea
                  value={textDraft}
                  onChange={(event) => setTextDraft(event.target.value)}
                  disabled={!selectedPhoneKey || isSending}
                  rows={4}
                  className="theme-input-control min-h-[120px] w-full rounded-[14px] px-3 py-2 text-sm"
                  placeholder={selectedPhoneKey ? "Type an SMS reply to this number..." : "Select a number conversation first."}
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!selectedPhoneKey || isSending || !textDraft.trim()}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Send message"
                  title="Send"
                >
                  {isSending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </section>

      ) : null}

      {isTemplateBankOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4 py-6">
          <div className="theme-surface-card flex max-h-[min(88vh,860px)] w-full max-w-5xl flex-col rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">SMS Template Bank</p>
                <h2 className="mt-2 text-xl font-semibold text-[color:var(--text-primary)]">Manage shared SMS templates</h2>
                <p className="mt-1 text-sm text-[color:var(--text-secondary)]">Create templates, choose up to 4 quick picks, and insert copy into the SMS compose box without sending.</p>
              </div>
              <button
                type="button"
                onClick={closeTemplateBank}
                className="theme-control-surface rounded-full px-3 py-1 text-xs"
              >
                Close
              </button>
            </div>

            {templateSaveError ? (
              <div className="theme-alert-error mt-4 rounded-[14px] border px-3 py-2 text-sm">{templateSaveError}</div>
            ) : null}

            {templateMutationError ? (
              <div className="theme-alert-error mt-4 rounded-[14px] border px-3 py-2 text-sm">{templateMutationError}</div>
            ) : null}

            <div className="mt-5 grid min-h-0 flex-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-4">
                <section className="rounded-[20px] border border-[color:var(--border-subtle)] bg-[color:rgba(255,255,255,0.02)] p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Create Template</p>
                  <p className="mt-2 text-sm text-[color:var(--text-secondary)]">Add a shared SMS template for office users.</p>

                  <div className="mt-4 space-y-4">
                    <label className="block">
                      <span className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Template name</span>
                      <input
                        type="text"
                        value={templateName}
                        onChange={(event) => setTemplateName(event.target.value)}
                        disabled={isCreatingTemplate}
                        className="theme-input-control h-11 w-full rounded-[14px] px-3 text-sm"
                        placeholder="Inspection reminder"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Message body</span>
                      <textarea
                        value={templateBody}
                        onChange={(event) => setTemplateBody(event.target.value)}
                        rows={6}
                        disabled={isCreatingTemplate}
                        className="theme-input-control min-h-[160px] w-full rounded-[14px] px-3 py-2 text-sm"
                        placeholder="Hi {customer}, this is {company}. Your technician is on the way."
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void handleCreateTemplate()}
                      className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isCreatingTemplate || !templateName.trim() || !templateBody.trim()}
                    >
                      {isCreatingTemplate ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Save Template"}
                    </button>
                  </div>
                </section>

                <section className="rounded-[20px] border border-[color:var(--border-subtle)] bg-[color:rgba(255,255,255,0.02)] p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Placeholders</p>
                  <div className="mt-3 space-y-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                    <p className="break-words">Use placeholders inside your template: <span className="font-medium text-[color:var(--text-primary)]">Hi {`{customer}`}, this is {`{company}`}. </span></p>
                    <p className="break-words"><span className="font-medium text-[color:var(--text-primary)]">{`{customer}`}</span> = customer display name if linked, otherwise <span className="font-medium text-[color:var(--text-primary)]">there</span>.</p>
                    <p className="break-words"><span className="font-medium text-[color:var(--text-primary)]">{`{company}`}</span> = <span className="font-medium text-[color:var(--text-primary)]">{organizationDisplayName}</span>.</p>
                  </div>
                  <div className="mt-4 rounded-[16px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas)] p-3 text-[11px] leading-5 text-[color:var(--text-secondary)]">
                    <p className="font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">Preview</p>
                    <p className="mt-2 break-words">If customer is linked: <span className="text-[color:var(--text-primary)]">{placeholderLinkedPreview}</span></p>
                    <p className="mt-2 break-words">If no customer is linked: <span className="text-[color:var(--text-primary)]">{placeholderUnknownPreview}</span></p>
                  </div>
                </section>
              </div>

              <section className="flex min-h-0 flex-col rounded-[20px] border border-[color:var(--border-subtle)] bg-[color:rgba(255,255,255,0.02)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Template Bank</p>
                    <p className="mt-2 text-sm text-[color:var(--text-secondary)]">Choose up to 4 quick picks. Clicking Insert adds text to the compose box only.</p>
                  </div>
                  <span className="rounded-full bg-[color:var(--button-secondary-bg)] px-3 py-1 text-xs font-medium text-[color:var(--text-primary)]">
                    {quickPickCount}/4 quick picks
                  </span>
                </div>

                {isLoadingTemplates ? (
                  <p className="mt-4 text-sm text-[color:var(--text-secondary)]">
                    <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />
                    Loading SMS templates...
                  </p>
                ) : smsTemplates.length === 0 ? (
                  <p className="mt-4 text-sm text-[color:var(--text-secondary)]">No active SMS templates yet. Create one from the form on the left.</p>
                ) : (
                  <div className="mt-4 min-h-0 flex-1 overflow-auto pr-1">
                    <div className="space-y-3">
                      {smsTemplates.map((template) => {
                        const isQuickPick = template.quickPickOrder !== null;
                        const isQuickPickBusy = templateActionKey === `quick:${template.id}`;
                        const isDeleteBusy = templateActionKey === `delete:${template.id}`;
                        const cannotSelectQuickPick = !isQuickPick && quickPickCount >= 4;

                        return (
                          <article
                            key={template.id}
                            className="rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas)] px-4 py-4"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-sm font-semibold text-[color:var(--text-primary)]">{template.name}</p>
                                  {isQuickPick ? (
                                    <span className="rounded-full bg-[color:rgba(16,185,129,0.16)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-200">
                                      Quick Pick {template.quickPickOrder}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[color:var(--text-secondary)]">{template.body}</p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleApplyTemplate(template)}
                                  className="theme-control-surface rounded-full px-3 py-1.5 text-xs"
                                >
                                  Insert
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleToggleQuickPick(template)}
                                  disabled={isQuickPickBusy || cannotSelectQuickPick}
                                  className="theme-control-surface inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                                  title={cannotSelectQuickPick ? "Unchoose a quick pick before selecting another template." : undefined}
                                >
                                  {isQuickPickBusy ? (
                                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                  ) : isQuickPick ? (
                                    <Check className="h-3.5 w-3.5" />
                                  ) : (
                                    <Plus className="h-3.5 w-3.5" />
                                  )}
                                  {isQuickPick ? "Remove Quick Pick" : "Choose Quick Pick"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeactivateTemplate(template)}
                                  disabled={isDeleteBusy}
                                  className="theme-control-surface inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isDeleteBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                  Delete
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
