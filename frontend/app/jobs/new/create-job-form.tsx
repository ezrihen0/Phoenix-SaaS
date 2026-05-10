"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarDays, LoaderCircle, MapPin, Save, ShieldCheck, UserRound, Wrench } from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";
import { getServiceTypeLabel } from "@/lib/crm/statuses";
import type { Database } from "@/lib/types/database";

type ServiceType = Database["public"]["Enums"]["service_type"];

type TechnicianOption = Pick<
  Database["public"]["Tables"]["technicians"]["Row"],
  "id" | "display_name" | "phone" | "specialties" | "is_active" | "last_seen_at"
>;

type CreateJobSource = {
  kind: "customer" | "lead";
  customerId: string | null;
  leadId: string | null;
  customerLabel: string;
  phone: string;
  email: string | null;
  serviceAddressLine1: string;
  serviceAddressLine2: string | null;
  serviceCity: string;
  serviceStateOrRegion: string | null;
  servicePostalCode: string;
  defaultServiceType: ServiceType;
  defaultInternalNotes: string;
  backHref: string;
  backLabel: string;
  sourceMessage: string;
};

const serviceTypes: ServiceType[] = ["inspection", "cleaning", "repair", "rebuild"];

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2 text-sm text-white/70">
      <span className="text-[11px] uppercase tracking-[0.26em] text-white/42">{label}</span>
      {children}
    </label>
  );
}

function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/28 focus:border-[color:rgba(212,175,55,0.28)] focus:bg-black/30 ${props.className ?? ""}`.trim()}
    />
  );
}

function FieldSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-[color:rgba(212,175,55,0.28)] focus:bg-black/30 ${props.className ?? ""}`.trim()}
    />
  );
}

function FieldTextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-[140px] w-full rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/28 focus:border-[color:rgba(212,175,55,0.28)] focus:bg-black/30 ${props.className ?? ""}`.trim()}
    />
  );
}

export default function CreateJobForm({
  source,
  technicians,
}: {
  source: CreateJobSource;
  technicians: TechnicianOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serviceType, setServiceType] = useState<ServiceType>(source.defaultServiceType);
  const [serviceAddressLine1, setServiceAddressLine1] = useState(source.serviceAddressLine1);
  const [serviceAddressLine2, setServiceAddressLine2] = useState(source.serviceAddressLine2 ?? "");
  const [serviceCity, setServiceCity] = useState(source.serviceCity);
  const [serviceStateOrRegion, setServiceStateOrRegion] = useState(source.serviceStateOrRegion ?? "");
  const [servicePostalCode, setServicePostalCode] = useState(source.servicePostalCode);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [assignedTechnicianId, setAssignedTechnicianId] = useState("");
  const [internalNotes, setInternalNotes] = useState(source.defaultInternalNotes);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!scheduledDate || !scheduledTime) {
      setErrorMessage("Choose both a scheduled date and scheduled time.");
      return;
    }

    if (!assignedTechnicianId) {
      setErrorMessage("Assign a technician before creating the job.");
      return;
    }

    const scheduledFor = new Date(`${scheduledDate}T${scheduledTime}`);

    if (Number.isNaN(scheduledFor.getTime())) {
      setErrorMessage("The scheduled date or time is invalid.");
      return;
    }

    setErrorMessage(null);

    startTransition(() => {
      void (async () => {
        try {
          await crmApiFetch<{ job: { id: string } }>("/api/jobs", {
            method: "POST",
            body: JSON.stringify({
              customerId: source.customerId,
              leadId: source.leadId,
              serviceType,
              serviceAddressLine1,
              serviceAddressLine2: serviceAddressLine2 || null,
              serviceCity,
              serviceStateOrRegion: serviceStateOrRegion || null,
              servicePostalCode,
              scheduledFor: scheduledFor.toISOString(),
              assignedTechnicianId,
              internalNotes,
            }),
          });

          router.push("/jobs");
          router.refresh();
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : "The job could not be created.");
        }
      })();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.94),rgba(12,12,12,0.92))] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-[24px] border border-white/10 bg-black/20 p-5">
          <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--flat-gold)]">Source</p>
          <div className="mt-5 space-y-4 text-sm text-white/70">
            <div className="flex items-start gap-3">
              <UserRound className="mt-0.5 h-4 w-4 text-[color:var(--flat-gold)]" />
              <div>
                <p className="text-white">{source.customerLabel}</p>
                <p className="mt-1 text-white/42">{source.kind === "lead" ? "Customer will be created from this lead." : "Existing customer record."}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 text-[color:var(--flat-gold)]" />
              <span>
                {[source.serviceAddressLine1, source.serviceAddressLine2, [source.serviceCity, source.serviceStateOrRegion].filter(Boolean).join(", "), source.servicePostalCode]
                  .filter(Boolean)
                  .join(" • ")}
              </span>
            </div>
            <div className="rounded-[20px] border border-[color:rgba(212,175,55,0.18)] bg-[color:rgba(212,175,55,0.08)] px-4 py-3 text-sm text-[#f7df97]">
              {source.sourceMessage}
            </div>
          </div>

          <div className="mt-6">
            <Link
              href={source.backHref}
              className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm text-white/70 transition hover:border-white/24 hover:text-white"
            >
              {source.backLabel}
            </Link>
          </div>
        </section>

        <section>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldLabel label="Customer">
              <FieldInput value={source.customerLabel} readOnly aria-readonly />
            </FieldLabel>
            <FieldLabel label="Service Type">
              <FieldSelect value={serviceType} onChange={(event) => setServiceType(event.target.value as ServiceType)} required>
                {serviceTypes.map((option) => (
                  <option key={option} value={option}>
                    {getServiceTypeLabel(option)}
                  </option>
                ))}
              </FieldSelect>
            </FieldLabel>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FieldLabel label="Address Line 1">
              <FieldInput value={serviceAddressLine1} onChange={(event) => setServiceAddressLine1(event.target.value)} required />
            </FieldLabel>
            <FieldLabel label="Address Line 2">
              <FieldInput value={serviceAddressLine2} onChange={(event) => setServiceAddressLine2(event.target.value)} />
            </FieldLabel>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <FieldLabel label="City">
              <FieldInput value={serviceCity} onChange={(event) => setServiceCity(event.target.value)} required />
            </FieldLabel>
            <FieldLabel label="State / Region">
              <FieldInput value={serviceStateOrRegion} onChange={(event) => setServiceStateOrRegion(event.target.value)} />
            </FieldLabel>
            <FieldLabel label="Postal Code">
              <FieldInput value={servicePostalCode} onChange={(event) => setServicePostalCode(event.target.value)} required />
            </FieldLabel>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FieldLabel label="Scheduled Date">
              <FieldInput type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} required />
            </FieldLabel>
            <FieldLabel label="Scheduled Time">
              <FieldInput type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} required />
            </FieldLabel>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FieldLabel label="Assigned Technician">
              <FieldSelect value={assignedTechnicianId} onChange={(event) => setAssignedTechnicianId(event.target.value)} required>
                <option value="">Select a technician</option>
                {technicians.map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.display_name}
                  </option>
                ))}
              </FieldSelect>
            </FieldLabel>
            <div className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/56">
              <div className="flex items-center gap-2 text-white/72">
                <CalendarDays className="h-4 w-4 text-[color:var(--flat-gold)]" />
                <span>Jobs are created as scheduled items.</span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-white/48">
                <Wrench className="h-4 w-4 text-[color:var(--flat-gold)]" />
                <span>The new job will use the selected service type and assigned technician.</span>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <FieldLabel label="Internal Notes">
              <FieldTextArea value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} required placeholder="Arrival notes, access details, fireplace condition, or call context." />
            </FieldLabel>
          </div>

          {errorMessage ? (
            <div className="mt-5 rounded-[20px] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {errorMessage}
            </div>
          ) : null}

          {technicians.length === 0 ? (
            <div className="mt-5 rounded-[20px] border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              At least one active technician is required before a job can be created.
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isPending || technicians.length === 0}
              className="inline-flex items-center gap-2 rounded-full border border-[color:rgba(212,175,55,0.24)] bg-[linear-gradient(135deg,rgba(212,175,55,0.24),rgba(212,175,55,0.08))] px-5 py-3 text-sm font-medium text-[#f7df97] transition hover:bg-[linear-gradient(135deg,rgba(212,175,55,0.3),rgba(212,175,55,0.12))] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {source.kind === "lead" ? "Create customer and job" : "Create job"}
            </button>
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 rounded-full border border-white/12 px-5 py-3 text-sm text-white/70 transition hover:border-white/24 hover:text-white"
            >
              <ShieldCheck className="h-4 w-4" />
              Cancel
            </Link>
          </div>
        </section>
      </div>
    </form>
  );
}