"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Briefcase, LoaderCircle, MessageSquare, UserPlus, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";

import { crmApiFetch } from "@/lib/crm/browser-api";

type ServiceType = "inspection" | "cleaning" | "repair" | "rebuild";

type TechnicianOption = {
  id: string;
  display_name: string;
};

type CustomerDetail = {
  customer: {
    id: string;
    full_name: string;
    phone: string;
    service_address_line_1: string;
    service_address_line_2: string | null;
    service_city: string;
    service_state_or_region: string | null;
    service_postal_code: string;
    preferred_service_type: ServiceType | null;
    notes: string | null;
  };
};

type CallRowActionsProps = {
  canManageCrm: boolean;
  callId: string;
  matchedClientId: string | null;
  matchedLeadId: string | null;
  fromNumber: string | null;
  source: string;
  createdAt: string;
  campaignName: string | null;
};

function resolveLeadPrefillSource(source: string) {
  switch (source.trim()) {
    case "google":
    case "website":
    case "referral":
    case "repeat_customer":
    case "other":
    case "phone":
      return source.trim();
    default:
      return "phone";
  }
}

function buildCreateLeadHref(input: {
  fromNumber: string | null;
  source: string;
  callId: string;
  createdAt: string;
  campaignName: string | null;
}) {
  const params = new URLSearchParams();

  if (input.fromNumber) {
    params.set("prefillPhone", input.fromNumber);
  }

  params.set("prefillSource", resolveLeadPrefillSource(input.source));
  params.set("recentCallId", input.callId);
  params.set(
    "prefillDescription",
    `Inbound call captured from ${input.fromNumber ?? "unknown caller"} on ${input.createdAt}. Source: ${input.campaignName ?? input.source}. Recent call id: ${input.callId}.`,
  );

  return `/leads?${params.toString()}`;
}

function ActionIconButton({
  href,
  title,
  className,
  children,
}: {
  href: string;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-label={title}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--cmp-border-subtle)] text-white transition ${className ?? "bg-sky-600 hover:bg-sky-700"}`}
    >
      {children}
    </Link>
  );
}

export default function CallRowActions({
  canManageCrm,
  callId,
  matchedClientId,
  matchedLeadId,
  fromNumber,
  source,
  createdAt,
  campaignName,
}: CallRowActionsProps) {
  const router = useRouter();
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);

  const createLeadHref = useMemo(() => buildCreateLeadHref({
    fromNumber,
    source,
    callId,
    createdAt,
    campaignName,
  }), [callId, campaignName, createdAt, fromNumber, source]);
  const crmRestrictionTitle = "CRM actions on recent calls require office admin access";
  const customerCreationUnavailableTitle = "Direct customer creation from recent calls is not available yet. Create a lead first.";
  const smsHandoffUnavailableTitle = "SMS thread handoff from recent calls is temporarily unavailable while messaging access is being stabilized.";

  return (
    <>
      <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-[color:rgba(255,255,255,0.06)] bg-[color:rgba(255,255,255,0.02)] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        {matchedClientId && canManageCrm ? (
          <ActionIconButton
            href={`/customers/${matchedClientId}`}
            title="Open customer"
            className="bg-[color:rgba(212,175,55,0.18)] text-[color:var(--flat-gold)] hover:bg-[color:rgba(212,175,55,0.28)]"
          >
            <UserRound className="h-4 w-4" />
          </ActionIconButton>
        ) : (
          <button
            type="button"
            title={canManageCrm ? customerCreationUnavailableTitle : crmRestrictionTitle}
            aria-label={canManageCrm ? customerCreationUnavailableTitle : crmRestrictionTitle}
            disabled
            className="inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full border border-dashed border-[color:var(--cmp-border-subtle)] bg-transparent text-[color:var(--text-muted)] opacity-50"
          >
            {matchedClientId ? <UserRound className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          </button>
        )}

        <button
          type="button"
          title={!canManageCrm ? crmRestrictionTitle : matchedClientId ? "Create and schedule job" : "Link customer first to create job"}
          aria-label={!canManageCrm ? crmRestrictionTitle : matchedClientId ? "Create and schedule job" : "Link customer first to create job"}
          disabled={!canManageCrm || !matchedClientId}
          onClick={() => setIsScheduleOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:rgba(239,68,68,0.78)] text-white transition hover:bg-[color:rgba(239,68,68,0.92)] disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:text-[color:var(--text-muted)] disabled:opacity-45"
        >
          <Briefcase className="h-4 w-4" />
        </button>

        {matchedClientId ? (
          <button
            type="button"
            title={smsHandoffUnavailableTitle}
            aria-label={smsHandoffUnavailableTitle}
            disabled
            className="inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full border border-dashed border-[color:rgba(5,150,105,0.28)] bg-[color:rgba(5,150,105,0.12)] text-[color:rgba(167,243,208,0.78)] opacity-70"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
        ) : null}

        {!matchedClientId ? (
          canManageCrm ? matchedLeadId ? (
            <ActionIconButton
              href={`/leads?leadId=${encodeURIComponent(matchedLeadId)}`}
              title="Open lead"
              className="bg-[color:rgba(59,130,246,0.24)] hover:bg-[color:rgba(59,130,246,0.34)]"
            >
              <span className="text-[10px] font-semibold uppercase">L</span>
            </ActionIconButton>
          ) : (
            <ActionIconButton
              href={createLeadHref}
              title="Create lead from call"
              className="bg-[color:rgba(59,130,246,0.24)] hover:bg-[color:rgba(59,130,246,0.34)]"
            >
              <span className="text-[10px] font-semibold uppercase">+L</span>
            </ActionIconButton>
          ) : (
            <button
              type="button"
              title={crmRestrictionTitle}
              aria-label={crmRestrictionTitle}
              disabled
              className="inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full border border-dashed border-[color:var(--cmp-border-subtle)] bg-transparent text-[color:var(--text-muted)] opacity-50"
            >
              <span className="text-[10px] font-semibold uppercase">{matchedLeadId ? "L" : "+L"}</span>
            </button>
          )
        ) : null}
      </div>

      {isScheduleOpen && canManageCrm && matchedClientId ? (
        <CreateJobScheduleModal
          customerId={matchedClientId}
          onClose={() => setIsScheduleOpen(false)}
          onSaved={() => {
            setIsScheduleOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function CreateJobScheduleModal({
  customerId,
  onClose,
  onSaved,
}: {
  customerId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isBooting, setIsBooting] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [customer, setCustomer] = useState<CustomerDetail["customer"] | null>(null);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);

  const [serviceType, setServiceType] = useState<ServiceType>("inspection");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateOrRegion, setStateOrRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [assignedTechnicianId, setAssignedTechnicianId] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  useEffect(() => {
    let disposed = false;

    void (async () => {
      try {
        const [detail, techRows] = await Promise.all([
          crmApiFetch<CustomerDetail>(`/api/customers/${customerId}`),
          crmApiFetch<TechnicianOption[]>("/api/technicians"),
        ]);

        if (disposed) {
          return;
        }

        setCustomer(detail.customer);
        setTechnicians(techRows);
        setServiceType(detail.customer.preferred_service_type ?? "inspection");
        setAddressLine1(detail.customer.service_address_line_1 ?? "");
        setAddressLine2(detail.customer.service_address_line_2 ?? "");
        setCity(detail.customer.service_city ?? "");
        setStateOrRegion(detail.customer.service_state_or_region ?? "");
        setPostalCode(detail.customer.service_postal_code ?? "");
        setInternalNotes(detail.customer.notes ?? "");
      } catch (error) {
        if (!disposed) {
          setErrorMessage(error instanceof Error ? error.message : "Could not load customer scheduling data.");
        }
      } finally {
        if (!disposed) {
          setIsBooting(false);
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [customerId]);

  async function handleCreateJob() {
    if (!customer) {
      setErrorMessage("Customer was not loaded.");
      return;
    }

    if (!scheduledDate || !scheduledTime) {
      setErrorMessage("Choose scheduled date and time.");
      return;
    }

    if (!assignedTechnicianId) {
      setErrorMessage("Assign a technician.");
      return;
    }

    if (!addressLine1.trim() || !city.trim() || !postalCode.trim()) {
      setErrorMessage("Address line 1, city, and postal code are required.");
      return;
    }

    const scheduledFor = new Date(`${scheduledDate}T${scheduledTime}`);

    if (Number.isNaN(scheduledFor.getTime())) {
      setErrorMessage("Invalid schedule date or time.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await crmApiFetch<{ id: string }>("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          customerId: customer.id,
          leadId: null,
          serviceType,
          serviceAddressLine1: addressLine1.trim(),
          serviceAddressLine2: addressLine2.trim() || null,
          serviceCity: city.trim(),
          serviceStateOrRegion: stateOrRegion.trim() || null,
          servicePostalCode: postalCode.trim(),
          scheduledFor: scheduledFor.toISOString(),
          assignedTechnicianId,
          internalNotes: internalNotes.trim() || `Job created from recent call for ${customer.full_name}`,
        }),
      });

      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The job could not be created.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 p-4">
      <div className="theme-surface-modal w-full max-w-3xl rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(10,10,10,0.9))] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.38)]">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-[color:var(--text-primary)]">Create & Schedule Job</h3>
          <button
            type="button"
            onClick={onClose}
            className="theme-control-surface rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em] text-[color:var(--text-secondary)]"
          >
            Close
          </button>
        </div>

        {isBooting ? (
          <div className="mt-6 inline-flex items-center gap-2 text-sm text-[color:var(--text-secondary)]">
            <LoaderCircle className="h-4 w-4 animate-spin text-[color:var(--flat-gold)]" />
            Loading customer and technician data...
          </div>
        ) : (
          <>
            {customer ? <p className="mt-3 text-sm text-[color:var(--text-secondary)]">Customer: <span className="text-[color:var(--text-primary)]">{customer.full_name}</span></p> : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="space-y-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                <span>Service Type</span>
                <select
                  value={serviceType}
                  onChange={(event) => setServiceType(event.target.value as ServiceType)}
                  className="theme-input-control w-full rounded-[14px] px-3 py-2.5 text-sm"
                >
                  <option value="inspection">Inspection</option>
                  <option value="cleaning">Cleaning</option>
                  <option value="repair">Repair</option>
                  <option value="rebuild">Rebuild</option>
                </select>
              </label>
              <label className="space-y-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                <span>Technician</span>
                <select
                  value={assignedTechnicianId}
                  onChange={(event) => setAssignedTechnicianId(event.target.value)}
                  className="theme-input-control w-full rounded-[14px] px-3 py-2.5 text-sm"
                >
                  <option value="">Select technician</option>
                  {technicians.map((technician) => (
                    <option key={technician.id} value={technician.id}>{technician.display_name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                <span>Scheduled Date</span>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(event) => setScheduledDate(event.target.value)}
                  className="theme-input-control w-full rounded-[14px] px-3 py-2.5 text-sm"
                />
              </label>
              <label className="space-y-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                <span>Scheduled Time</span>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(event) => setScheduledTime(event.target.value)}
                  className="theme-input-control w-full rounded-[14px] px-3 py-2.5 text-sm"
                />
              </label>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)] sm:col-span-2">
                <span>Address Line 1</span>
                <input
                  value={addressLine1}
                  onChange={(event) => setAddressLine1(event.target.value)}
                  className="theme-input-control w-full rounded-[14px] px-3 py-2.5 text-sm"
                />
              </label>
              <label className="space-y-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)] sm:col-span-2">
                <span>Address Line 2</span>
                <input
                  value={addressLine2}
                  onChange={(event) => setAddressLine2(event.target.value)}
                  className="theme-input-control w-full rounded-[14px] px-3 py-2.5 text-sm"
                />
              </label>
              <label className="space-y-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                <span>City</span>
                <input
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  className="theme-input-control w-full rounded-[14px] px-3 py-2.5 text-sm"
                />
              </label>
              <label className="space-y-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                <span>State / Region</span>
                <input
                  value={stateOrRegion}
                  onChange={(event) => setStateOrRegion(event.target.value)}
                  className="theme-input-control w-full rounded-[14px] px-3 py-2.5 text-sm"
                />
              </label>
              <label className="space-y-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)] sm:col-span-2">
                <span>Postal Code</span>
                <input
                  value={postalCode}
                  onChange={(event) => setPostalCode(event.target.value)}
                  className="theme-input-control w-full rounded-[14px] px-3 py-2.5 text-sm"
                />
              </label>
            </div>

            <label className="mt-3 block space-y-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
              <span>Internal Notes</span>
              <textarea
                value={internalNotes}
                onChange={(event) => setInternalNotes(event.target.value)}
                className="theme-input-control min-h-[100px] w-full rounded-[14px] px-3 py-2.5 text-sm"
              />
            </label>

            {errorMessage ? (
              <div className="theme-alert-error mt-4 rounded-[14px] border px-3 py-2 text-sm">{errorMessage}</div>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="theme-control-surface rounded-[14px] px-4 py-2 text-xs uppercase tracking-[0.2em] text-[color:var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSaving || !customer}
                onClick={() => {
                  void handleCreateJob();
                }}
                className="theme-btn-secondary inline-flex items-center gap-2 rounded-[14px] px-4 py-2 text-xs uppercase tracking-[0.2em] transition disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Briefcase className="h-4 w-4" />}
                Create Job
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
