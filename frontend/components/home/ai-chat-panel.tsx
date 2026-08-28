"use client";



import { LoaderCircle, SendHorizontal } from "lucide-react";

import Link from "next/link";

import { useTranslations } from "next-intl";

import { useCallback, useState } from "react";



import { crmApiFetch } from "@/lib/crm/browser-api";



type AiChatRecommendation = {

  title: string;

  reason: string;

  priority: "high" | "medium" | "low";

  targetHref: string;

};



type AiChatGroundingItem = {

  source: string;

  label: string;

};



type AiChatApiResponse = {

  status: "ok" | "provider_not_configured" | "disabled" | "error";

  agentKey: string;

  provider: string;

  model: string;

  message: string;

  recommendations?: AiChatRecommendation[];

  grounding?: AiChatGroundingItem[];

  detectedMode?: string;

  runId?: string;

};



type AssistantTurn = {

  id: string;

  role: "assistant";

  content: string;

  runId?: string;

  recommendations: AiChatRecommendation[];

  grounding: AiChatGroundingItem[];

  feedbackSubmitted: boolean;

};



type UserTurn = {

  id: string;

  role: "user";

  content: string;

};



type ChatTurn = UserTurn | AssistantTurn;



function newTurnId() {

  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

}



function priorityAccentClass(priority: AiChatRecommendation["priority"]) {

  if (priority === "high") {

    return "border-[color:var(--sem-accent-primary)]";

  }

  if (priority === "medium") {

    return "border-[color:var(--cmp-border-accent)]";

  }

  return "border-[color:var(--cmp-border-subtle)]";

}



const panelClass =

  "theme-surface-card rounded-[22px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_18px_55px_color-mix(in_srgb,var(--bg-canvas)_72%,transparent)] backdrop-blur-md";



export function AiChatPanel() {

  const t = useTranslations("home.aiChat");

  const [input, setInput] = useState("");

  const [turns, setTurns] = useState<ChatTurn[]>([]);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [feedbackError, setFeedbackError] = useState<string | null>(null);



  const sendMessage = useCallback(async () => {

    const message = input.trim();

    if (!message || loading) {

      return;

    }



    setLoading(true);

    setError(null);

    setFeedbackError(null);

    setInput("");

    setTurns((prev) => [...prev, { id: newTurnId(), role: "user", content: message }]);



    try {

      const payload = await crmApiFetch<AiChatApiResponse>("/api/ai/chat", {

        method: "POST",

        body: JSON.stringify({ message }),

      });



      if (payload.status === "provider_not_configured") {

        setError(t("providerNotConfigured"));

        return;

      }



      if (payload.status === "disabled") {

        setError(t("disabled"));

        return;

      }



      if (payload.status !== "ok" || !payload.message.trim()) {

        setError(t("genericError"));

        return;

      }



      setTurns((prev) => [

        ...prev,

        {

          id: newTurnId(),

          role: "assistant",

          content: payload.message.trim(),

          runId: payload.runId,

          recommendations: payload.recommendations ?? [],

          grounding: payload.grounding ?? [],

          feedbackSubmitted: false,

        },

      ]);

    } catch (err) {

      setError(err instanceof Error ? err.message : t("genericError"));

    } finally {

      setLoading(false);

    }

  }, [input, loading, t]);



  const submitFeedback = useCallback(

    async (turnId: string, runId: string, feedback: "useful" | "not_useful") => {

      setFeedbackError(null);

      try {

        await crmApiFetch(`/api/ai/chat/${encodeURIComponent(runId)}/feedback`, {

          method: "POST",

          body: JSON.stringify({ feedback }),

        });

        setTurns((prev) =>

          prev.map((turn) =>

            turn.id === turnId && turn.role === "assistant"

              ? { ...turn, feedbackSubmitted: true }

              : turn,

          ),

        );

      } catch (err) {

        setFeedbackError(err instanceof Error ? err.message : t("feedback.error"));

      }

    },

    [t],

  );



  return (

    <section className={panelClass}>

      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">

        {t("eyebrow")}

      </p>

      <h2 className="mt-2 text-xl font-semibold text-[color:var(--sem-display-headline)]">{t("title")}</h2>

      <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{t("description")}</p>

      <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">{t("limitations")}</p>



      <div className="mt-4 flex max-h-[520px] min-h-[220px] flex-col gap-3 overflow-y-auto rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] p-3">

        {turns.length === 0 ? (

          <p className="text-sm text-[color:var(--sem-text-muted)]">{t("emptyState")}</p>

        ) : (

          turns.map((turn) => (

            <div

              key={turn.id}

              className={[

                "max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-6",

                turn.role === "user"

                  ? "ml-auto bg-[color:var(--cmp-selected-surface)] text-[color:var(--sem-text-primary)]"

                  : "mr-auto border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] text-[color:var(--sem-text-secondary)]",

              ].join(" ")}

            >

              {turn.content}



              {turn.role === "assistant" && turn.grounding.length > 0 ? (

                <div className="mt-3 border-t border-[color:var(--cmp-border-subtle)] pt-2">

                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--sem-text-muted)]">

                    {t("grounding.eyebrow")}

                  </p>

                  <ul className="mt-1 list-inside list-disc text-xs text-[color:var(--sem-text-muted)]">

                    {turn.grounding.map((item, index) => (

                      <li key={`${turn.id}-ground-${index}`}>{item.label}</li>

                    ))}

                  </ul>

                </div>

              ) : null}



              {turn.role === "assistant" && turn.recommendations.length > 0 ? (

                <div className="mt-3 grid gap-2">

                  {turn.recommendations.map((rec, index) => (

                    <Link

                      key={`${turn.id}-rec-${index}`}

                      href={rec.targetHref}

                      className={`block rounded-xl border p-2.5 transition hover:bg-[color:var(--cmp-surface-soft)] ${priorityAccentClass(rec.priority)}`}

                    >

                      <p className="text-xs font-semibold text-[color:var(--sem-text-primary)]">{rec.title}</p>

                      <p className="mt-0.5 text-[11px] text-[color:var(--sem-text-muted)]">{rec.reason}</p>

                      <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[color:var(--sem-accent-primary)]">

                        {t("recommendations.open")}

                      </p>

                    </Link>

                  ))}

                </div>

              ) : null}



              {turn.role === "assistant" && turn.runId ? (

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[color:var(--cmp-border-subtle)] pt-2">

                  <span className="text-[10px] text-[color:var(--sem-text-muted)]">{t("feedback.prompt")}</span>

                  <button

                    type="button"

                    disabled={turn.feedbackSubmitted}

                    onClick={() => void submitFeedback(turn.id, turn.runId!, "useful")}

                    className="rounded-lg border border-[color:var(--cmp-border-subtle)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--sem-text-secondary)] disabled:opacity-50"

                  >

                    {t("feedback.useful")}

                  </button>

                  <button

                    type="button"

                    disabled={turn.feedbackSubmitted}

                    onClick={() => void submitFeedback(turn.id, turn.runId!, "not_useful")}

                    className="rounded-lg border border-[color:var(--cmp-border-subtle)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--sem-text-secondary)] disabled:opacity-50"

                  >

                    {t("feedback.notUseful")}

                  </button>

                  {turn.feedbackSubmitted ? (

                    <span className="text-[10px] text-[color:var(--sem-text-muted)]">{t("feedback.thanks")}</span>

                  ) : null}

                </div>

              ) : null}

            </div>

          ))

        )}

      </div>



      {error ? (

        <p className="mt-3 text-sm text-[color:var(--sem-status-danger-text,#b42318)]">{error}</p>

      ) : null}

      {feedbackError ? (

        <p className="mt-2 text-sm text-[color:var(--sem-status-danger-text,#b42318)]">{feedbackError}</p>

      ) : null}



      <div className="mt-4 flex gap-2">

        <textarea

          value={input}

          onChange={(event) => setInput(event.target.value)}

          onKeyDown={(event) => {

            if (event.key === "Enter" && !event.shiftKey) {

              event.preventDefault();

              void sendMessage();

            }

          }}

          rows={3}

          placeholder={t("inputPlaceholder")}

          disabled={loading}

          className="theme-control-surface-soft min-h-[88px] flex-1 resize-y rounded-xl border px-3 py-2 text-sm text-[color:var(--sem-text-primary)]"

        />

        <button

          type="button"

          onClick={() => void sendMessage()}

          disabled={loading || !input.trim()}

          className="theme-control-surface-soft inline-flex h-[88px] w-[88px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-semibold text-[color:var(--sem-accent-primary)] disabled:opacity-50"

        >

          {loading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}

          {t("send")}

        </button>

      </div>

    </section>

  );

}


