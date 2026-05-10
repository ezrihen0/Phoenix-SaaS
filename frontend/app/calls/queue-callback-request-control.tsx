"use client";

import { PhoneIncoming } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { crmApiFetch } from "@/lib/crm/browser-api";

import type { CallbackTaskItem } from "./callback-task-control";

type QueueCallbackRequestControlProps = {
  recentCallId: string;
  queueStatus: string | null;
  queueCallbackRequested: boolean;
  callbackTasks: CallbackTaskItem[];
};

export default function QueueCallbackRequestControl({
  recentCallId,
  queueStatus,
  queueCallbackRequested,
  callbackTasks,
}: QueueCallbackRequestControlProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeCallbackTask = callbackTasks.find((task) => task.status === "open" || task.status === "in_progress") ?? null;
  const isDisabled = isSubmitting || queueCallbackRequested || Boolean(activeCallbackTask);
  const label = queueCallbackRequested || activeCallbackTask ? "Queue Callback Requested" : "Request Queue Callback";
  const isRecoveryInMotion = queueCallbackRequested || Boolean(activeCallbackTask);
  const helperText = queueCallbackRequested
    ? "An office callback has already been requested for this queued call."
    : activeCallbackTask
      ? "A live callback task already exists for this call."
      : queueStatus
        ? `Queue state: ${queueStatus.replace(/_/g, " ")}`
        : null;
  const buttonClass = isRecoveryInMotion
    ? "border-[color:rgba(212,175,55,0.32)] bg-[color:rgba(212,175,55,0.14)] text-[color:var(--flat-gold)]"
    : "border-transparent bg-sky-600 text-white shadow-[0_12px_24px_rgba(14,165,233,0.24)] hover:bg-sky-700";

  async function handleRequest() {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await crmApiFetch(`/api/recent-calls/${recentCallId}/queue-callback-request`, {
        method: "POST",
        body: JSON.stringify({
          priority: "high",
          notes: "Queue callback requested from the recent calls view.",
        }),
      });

      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The queue callback request could not be saved.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleRequest}
        disabled={isDisabled}
        title={helperText ?? undefined}
        aria-label={label}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60 ${buttonClass}`}
      >
        <PhoneIncoming className="h-4 w-4" />
      </button>
      {errorMessage ? <p className="text-xs text-[color:var(--flat-coral)]">{errorMessage}</p> : null}
    </div>
  );
}