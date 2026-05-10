"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Save, UserRound } from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";

type TechnicianOption = {
  id: string;
  display_name: string;
  phone: string | null;
  is_active: boolean;
};

export default function JobTechnicianAssignmentPanel({
  jobId,
  currentTechnicianId,
  technicians,
}: {
  jobId: string;
  currentTechnicianId: string | null;
  technicians: TechnicianOption[];
}) {
  const router = useRouter();
  const [selectedTechnicianId, setSelectedTechnicianId] = useState(currentTechnicianId ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentSelection = technicians.find((technician) => technician.id === selectedTechnicianId) ?? null;
  const hasChanges = selectedTechnicianId !== (currentTechnicianId ?? "");

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-white">
        <UserRound className="h-4 w-4 text-[color:var(--flat-gold)]" />
        <span>Technician Assignment</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/54">
        Assign or change the field technician for this job.
      </p>

      <label className="mt-4 block space-y-2 text-sm text-white/66">
        <span>Technician</span>
        <select
          value={selectedTechnicianId}
          onChange={(event) => setSelectedTechnicianId(event.target.value)}
          className="w-full rounded-[18px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition focus:border-[color:rgba(212,175,55,0.34)]"
        >
          <option value="">Unassigned</option>
          {technicians.map((technician) => (
            <option key={technician.id} value={technician.id}>
              {technician.display_name}
              {technician.is_active ? "" : " (Inactive)"}
            </option>
          ))}
        </select>
      </label>

      <p className="mt-3 text-sm text-white/46">
        {currentSelection
          ? `${currentSelection.phone ?? "No phone on file"}${currentSelection.is_active ? "" : " • Inactive technician"}`
          : technicians.length
            ? "This job is currently unassigned."
            : "No technicians are available for assignment yet."}
      </p>

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

      <button
        type="button"
        disabled={isPending || !hasChanges}
        onClick={() => {
          setErrorMessage(null);
          setSuccessMessage(null);

          startTransition(() => {
            void (async () => {
              try {
                await crmApiFetch(`/api/jobs/${jobId}`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    assignedTechnicianId: selectedTechnicianId || null,
                  }),
                });
                setSuccessMessage(
                  selectedTechnicianId
                    ? "Technician assignment updated."
                    : "Technician assignment cleared.",
                );
                router.refresh();
              } catch (error) {
                setErrorMessage(
                  error instanceof Error
                    ? error.message
                    : "The technician assignment could not be updated.",
                );
              }
            })();
          });
        }}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[20px] border border-[color:rgba(212,175,55,0.24)] bg-[linear-gradient(135deg,rgba(212,175,55,0.24),rgba(212,175,55,0.08))] px-5 py-3 text-sm font-medium text-[#f7df97] transition hover:bg-[linear-gradient(135deg,rgba(212,175,55,0.3),rgba(212,175,55,0.12))] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save assignment
      </button>
    </div>
  );
}