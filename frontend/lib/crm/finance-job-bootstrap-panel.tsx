"use client";

import { useMemo, useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";

import { crmApiFetch } from "@/lib/crm/browser-api";
import { getJobTypeLabel, type JobTypeValue } from "@/lib/crm/job-field-display";
import { getServiceTypeLabel, type ServiceType } from "@/lib/crm/statuses";

const JOB_TYPE_OPTIONS: JobTypeValue[] = ["inspection", "installation_repair", "callback_warranty"];

const SERVICE_TYPE_OPTIONS: ServiceType[] = ["inspection", "cleaning", "repair", "rebuild"];

export type FinanceJobBootstrapPurpose = "invoice" | "estimate";

type FinanceJobBootstrapPanelProps = {
  customerId: string;
  purpose: FinanceJobBootstrapPurpose;
  serviceAddressLine1: string;
  serviceAddressLine2: string | null;
  serviceCity: string;
  serviceStateOrRegion: string | null;
  servicePostalCode: string;
};

function composerPathForJob(purpose: FinanceJobBootstrapPurpose, jobId: string) {
  return purpose === "invoice" ? `/invoices/create/${jobId}` : `/estimates/create/${jobId}`;
}

function purposeLabel(purpose: FinanceJobBootstrapPurpose) {
  return purpose === "invoice" ? "invoice" : "estimate";
}

export default function FinanceJobBootstrapPanel({
  customerId,
  purpose,
  serviceAddressLine1,
  serviceAddressLine2,
  serviceCity,
  serviceStateOrRegion,
  servicePostalCode,
}: FinanceJobBootstrapPanelProps) {
  const router = useRouter();
  const [jobType, setJobType] = useState<JobTypeValue | "">("");
  const [serviceType, setServiceType] = useState<ServiceType | "">("");
  const [line1, setLine1] = useState(serviceAddressLine1);
  const [line2, setLine2] = useState(serviceAddressLine2 ?? "");
  const [city, setCity] = useState(serviceCity);
  const [region, setRegion] = useState(serviceStateOrRegion ?? "");
  const [postalCode, setPostalCode] = useState(servicePostalCode);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSubmit = useMemo(() => {
    return (
      jobType !== "" &&
      serviceType !== "" &&
      line1.trim().length > 0 &&
      city.trim().length > 0 &&
      postalCode.trim().length > 0
    );
  }, [jobType, serviceType, line1, city, postalCode]);

  function submitMinimalJob() {
    if (!canSubmit || isPending || jobType === "" || serviceType === "") {
      return;
    }

    setErrorMessage(null);

    startTransition(() => {
      void (async () => {
        try {
          const response = await crmApiFetch<{ job: { id: string } }>("/api/jobs", {
            method: "POST",
            body: JSON.stringify({
              customerId,
              leadId: null,
              jobType,
              serviceType,
              serviceId: null,
              serviceAddressLine1: line1.trim(),
              serviceAddressLine2: line2.trim() || null,
              serviceCity: city.trim(),
              serviceStateOrRegion: region.trim() || null,
              servicePostalCode: postalCode.trim(),
              scheduledFor: null,
              scheduledWindow: null,
              assignedTechnicianId: null,
              customerConcern: null,
              internalNotes: null,
            }),
          });

          router.push(composerPathForJob(purpose, response.job.id));
          router.refresh();
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : "The job could not be created.");
        }
      })();
    });
  }

  return (
    <div className="mx-auto mt-6 max-w-xl rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5 text-left">
      <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Minimal job for {purposeLabel(purpose)}</p>
      <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
        Choose job type and service type, confirm the service address, then continue to the composer. Scheduling and technician assignment stay in full job intake.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Job type</span>
          <select
            value={jobType}
            onChange={(event) => setJobType(event.target.value as JobTypeValue | "")}
            className="theme-input-control w-full rounded-[18px] px-4 py-3 text-sm"
          >
            <option value="">Select job type</option>
            {JOB_TYPE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {getJobTypeLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Service type</span>
          <select
            value={serviceType}
            onChange={(event) => setServiceType(event.target.value as ServiceType | "")}
            className="theme-input-control w-full rounded-[18px] px-4 py-3 text-sm"
          >
            <option value="">Select service type</option>
            {SERVICE_TYPE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {getServiceTypeLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-4">
        <label className="space-y-2 text-sm">
          <span className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Service address</span>
          <input
            value={line1}
            onChange={(event) => setLine1(event.target.value)}
            className="theme-input-control w-full rounded-[18px] px-4 py-3 text-sm"
            placeholder="Address line 1"
            autoComplete="address-line1"
          />
        </label>
        <input
          value={line2}
          onChange={(event) => setLine2(event.target.value)}
          className="theme-input-control w-full rounded-[18px] px-4 py-3 text-sm"
          placeholder="Address line 2 (optional)"
          autoComplete="address-line2"
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className="theme-input-control w-full rounded-[18px] px-4 py-3 text-sm"
            placeholder="City"
            autoComplete="address-level2"
          />
          <input
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            className="theme-input-control w-full rounded-[18px] px-4 py-3 text-sm"
            placeholder="State / region"
            autoComplete="address-level1"
          />
          <input
            value={postalCode}
            onChange={(event) => setPostalCode(event.target.value)}
            className="theme-input-control w-full rounded-[18px] px-4 py-3 text-sm"
            placeholder="Postal code"
            autoComplete="postal-code"
          />
        </div>
      </div>

      {errorMessage ? (
        <div className="theme-alert-error mt-4 rounded-[18px] px-4 py-3 text-sm">{errorMessage}</div>
      ) : null}

      <button
        type="button"
        disabled={!canSubmit || isPending}
        onClick={submitMinimalJob}
        className="theme-btn-primary mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[18px] px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
        Create job and continue
      </button>
    </div>
  );
}
