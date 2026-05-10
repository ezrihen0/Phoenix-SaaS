"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, LoaderCircle, Sparkles } from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";

type JobNoteRecord = {
  id: number;
  findings: string | null;
  recommendations: string | null;
  photo_urls: string[];
  created_at: string;
  updated_at: string;
};

function formatNoteDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function JobNotesSection({
  jobId,
  notes,
}: {
  jobId: string;
  notes: JobNoteRecord[];
}) {
  const router = useRouter();
  const [findings, setFindings] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.94),rgba(12,12,12,0.92))] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)] lg:p-6">
      <div className="flex items-center gap-2 text-white">
        <FileText className="h-4 w-4 text-[color:var(--flat-gold)]" />
        <h2 className="text-lg font-semibold text-[#f5ecd2]">Job Notes</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/58">
        Save service findings and next-step recommendations directly on the job record.
      </p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
          <label className="block space-y-2 text-sm text-white/66">
            <span>Findings</span>
            <textarea
              value={findings}
              onChange={(event) => setFindings(event.target.value)}
              placeholder="Observed fireplace condition, parts issues, safety concerns, or visit details."
              className="min-h-[130px] w-full rounded-[18px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-[color:rgba(212,175,55,0.34)]"
            />
          </label>

          <label className="block space-y-2 text-sm text-white/66">
            <span>Recommendations</span>
            <textarea
              value={recommendations}
              onChange={(event) => setRecommendations(event.target.value)}
              placeholder="Recommended repair, approval step, return visit, or office follow-up."
              className="min-h-[130px] w-full rounded-[18px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-[color:rgba(212,175,55,0.34)]"
            />
          </label>

          {errorMessage ? (
            <div className="rounded-[18px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {errorMessage}
            </div>
          ) : null}
          {successMessage ? (
            <div className="rounded-[18px] border border-[color:rgba(212,175,55,0.24)] bg-[color:rgba(212,175,55,0.1)] px-4 py-3 text-sm text-[#f5d980]">
              {successMessage}
            </div>
          ) : null}

          <button
            type="button"
            disabled={isSaving || isPending}
            onClick={() => {
              setIsSaving(true);
              setErrorMessage(null);
              setSuccessMessage(null);

              void crmApiFetch(`/api/jobs/${jobId}/notes`, {
                method: "POST",
                body: JSON.stringify({
                  findings: findings || null,
                  recommendations: recommendations || null,
                  photoUrls: [],
                }),
              })
                .then(() => {
                  setFindings("");
                  setRecommendations("");
                  setSuccessMessage("Job note saved.");
                  startTransition(() => {
                    router.refresh();
                  });
                })
                .catch((error: unknown) => {
                  setErrorMessage(error instanceof Error ? error.message : "The job note could not be saved.");
                })
                .finally(() => {
                  setIsSaving(false);
                });
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] border border-[color:rgba(212,175,55,0.24)] bg-[linear-gradient(135deg,rgba(212,175,55,0.24),rgba(212,175,55,0.08))] px-5 py-3 text-sm font-medium text-[#f7df97] transition hover:bg-[linear-gradient(135deg,rgba(212,175,55,0.3),rgba(212,175,55,0.12))] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Save note
          </button>
        </div>

        <div className="space-y-3">
          <p className="text-[11px] uppercase tracking-[0.34em] text-white/34">Timeline</p>
          {notes.length ? (
            notes.map((note) => (
              <article
                key={note.id}
                className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/58"
              >
                <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.24em] text-white/34">
                  <span>Note #{note.id}</span>
                  <span>{formatNoteDateTime(note.created_at)}</span>
                </div>
                {note.findings ? (
                  <p className="mt-3 whitespace-pre-line leading-6">
                    <span className="text-white/84">Findings:</span> {note.findings}
                  </p>
                ) : null}
                {note.recommendations ? (
                  <p className="mt-2 whitespace-pre-line leading-6">
                    <span className="text-white/84">Recommendations:</span> {note.recommendations}
                  </p>
                ) : null}
              </article>
            ))
          ) : (
            <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-white/42">
              No job notes have been added yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}