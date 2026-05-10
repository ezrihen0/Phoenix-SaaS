"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ShieldCheck } from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";
import {
  canTransitionJobStatus,
  getJobStatusLabel,
  jobStatuses,
  type JobStatus,
} from "@/lib/crm/statuses";

function statusTone(status: JobStatus) {
  if (status === "cancelled") {
    return "border-rose-500/30 bg-rose-500/12 text-rose-100";
  }

  if (status === "new_lead") {
    return "border-rose-400/25 bg-rose-400/12 text-rose-100";
  }

  if (status === "contacted") {
    return "border-yellow-400/25 bg-yellow-400/12 text-yellow-100";
  }

  if (status === "scheduled") {
    return "border-sky-400/25 bg-sky-400/12 text-sky-100";
  }

  if (status === "on_the_way") {
    return "border-cyan-400/25 bg-cyan-400/12 text-cyan-100";
  }

  if (status === "in_progress") {
    return "border-orange-400/25 bg-orange-400/12 text-orange-100";
  }

  if (status === "waiting_for_approval") {
    return "border-violet-400/25 bg-violet-400/12 text-violet-100";
  }

  return "border-emerald-400/25 bg-emerald-400/12 text-emerald-100";
}

export default function JobStatusPanel({
  jobId,
  currentStatus,
}: {
  jobId: string;
  currentStatus: JobStatus;
}) {
  const router = useRouter();
  const [statusNote, setStatusNote] = useState("");
  const [busyStatus, setBusyStatus] = useState<JobStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-white">
        <ShieldCheck className="h-4 w-4 text-[color:var(--flat-gold)]" />
        <span>Status Flow</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/58">
        Move the job through the Phoenix CRM pipeline and store an optional note on the status timeline. Cancelling a job requires a reason.
      </p>

      <label className="mt-4 block space-y-2 text-sm text-white/66">
        <span>Status Note</span>
        <textarea
          value={statusNote}
          onChange={(event) => setStatusNote(event.target.value)}
          placeholder="Optional context for status changes. Add the cancellation reason here before marking a job cancelled."
          className="min-h-[96px] w-full rounded-[18px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-[color:rgba(212,175,55,0.34)]"
        />
      </label>

      {errorMessage ? (
        <div className="mt-4 rounded-[18px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </div>
      ) : null}
      {successMessage ? (
        <div className="mt-4 rounded-[18px] border border-[color:rgba(212,175,55,0.24)] bg-[color:rgba(212,175,55,0.1)] px-4 py-3 text-sm text-[#f5d980]">
          {successMessage}
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {jobStatuses.map((status) => {
          const isCurrent = currentStatus === status;
          const canTransition = !isCurrent && canTransitionJobStatus(currentStatus, status);

          return (
            <button
              key={status}
              type="button"
              disabled={Boolean(busyStatus) || isPending || !canTransition}
              onClick={() => {
                const nextNote = statusNote.trim();

                if (status === "cancelled" && !nextNote) {
                  setErrorMessage("Add a cancellation reason before marking the job cancelled.");
                  setSuccessMessage(null);
                  return;
                }

                setBusyStatus(status);
                setErrorMessage(null);
                setSuccessMessage(null);

                void crmApiFetch(`/api/jobs/${jobId}/status`, {
                  method: "POST",
                  body: JSON.stringify({ status, note: nextNote || null }),
                })
                  .then(() => {
                    setStatusNote("");
                    setSuccessMessage(status === "cancelled" ? "Job cancelled." : `Job marked ${getJobStatusLabel(status)}.`);
                    startTransition(() => {
                      router.refresh();
                    });
                  })
                  .catch((error: unknown) => {
                    setErrorMessage(error instanceof Error ? error.message : "The job status could not be updated.");
                  })
                  .finally(() => {
                    setBusyStatus(null);
                  });
              }}
              className={`rounded-[18px] border px-3 py-3 text-xs uppercase tracking-[0.24em] transition ${isCurrent ? `${statusTone(status)} border-[color:rgba(212,175,55,0.28)]` : "border-white/10 bg-black/20 text-white/66 hover:border-white/20 hover:text-white"} disabled:cursor-not-allowed disabled:opacity-45`}
            >
              {busyStatus === status ? <LoaderCircle className="mx-auto h-4 w-4 animate-spin" /> : getJobStatusLabel(status)}
            </button>
          );
        })}
      </div>
    </div>
  );
}