"use client";

import { useState } from "react";
import { CheckCircle2, Languages, LoaderCircle, Sparkles, XCircle } from "lucide-react";

import {
  finalizeCustomerOutputTranslation,
  generateCustomerOutputTranslation,
  type CustomerOutputTranslationDocumentKind,
  type CustomerOutputTranslationFieldKey,
  type CustomerOutputTranslationStatus,
  type CustomerOutputTranslationSurfaceKey,
} from "@/lib/language-store/client-customer-output-translations";

type TranslationFieldState = {
  recordId: string | null;
  text: string | null;
  status: CustomerOutputTranslationStatus | null;
  sourceText: string | null;
  sourceLanguageCode: string | null;
};

type CustomerOutputTranslationControlProps = {
  label: string;
  currentText: string;
  readOnly?: boolean;
  documentKind: CustomerOutputTranslationDocumentKind;
  documentId: string | null;
  documentLineKey: string;
  fieldKey: CustomerOutputTranslationFieldKey;
  surfaceKey: CustomerOutputTranslationSurfaceKey;
  sourceLanguageCode: string | null;
  state: TranslationFieldState;
  onChange: (nextState: TranslationFieldState) => void;
};

function normalizeComparableText(value: string | null | undefined) {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

export default function CustomerOutputTranslationControl({
  label,
  currentText,
  readOnly = false,
  documentKind,
  documentId,
  documentLineKey,
  fieldKey,
  surfaceKey,
  sourceLanguageCode,
  state,
  onChange,
}: CustomerOutputTranslationControlProps) {
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const normalizedCurrentText = normalizeComparableText(currentText);
  const normalizedTranslationText = normalizeComparableText(state.text);
  const normalizedSourceText = normalizeComparableText(state.sourceText);
  const isFinalizedSelected =
    state.status === "final"
    && normalizedTranslationText.length > 0
    && normalizedCurrentText === normalizedTranslationText;
  const isStale =
    Boolean(state.recordId)
    && !isFinalizedSelected
    && normalizedSourceText.length > 0
    && normalizedCurrentText !== normalizedSourceText;

  const disabledReason = !documentId
    ? "Save this document once before generating customer English output for this field."
    : !sourceLanguageCode || sourceLanguageCode === "en"
      ? "Switch the active organization language to a non-English language to generate customer English output."
      : normalizedCurrentText.length === 0
        ? "Enter line text before generating customer English output."
        : null;

  async function handleGenerate() {
    if (!documentId || !sourceLanguageCode || sourceLanguageCode === "en" || !normalizedCurrentText) {
      return;
    }

    setErrorMessage(null);
    setIsBusy(true);

    try {
      const result = await generateCustomerOutputTranslation({
        surface_key: surfaceKey,
        source_language_code: sourceLanguageCode,
        source_text: normalizedCurrentText,
        document_kind: documentKind,
        document_id: documentId,
        document_line_key: documentLineKey,
        field_key: fieldKey,
      });

      onChange({
        recordId: result.record.id,
        text: result.record.final_text ?? result.record.translated_text,
        status: result.record.status,
        sourceText: result.record.source_text,
        sourceLanguageCode: result.record.source_language_code,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Customer English output could not be generated.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleFinalize() {
    if (!state.recordId || !state.text) {
      return;
    }

    setErrorMessage(null);
    setIsBusy(true);

    try {
      const result = await finalizeCustomerOutputTranslation(state.recordId, state.text);
      onChange({
        recordId: result.record.id,
        text: result.record.final_text ?? result.record.translated_text,
        status: result.record.status,
        sourceText: result.record.source_text,
        sourceLanguageCode: result.record.source_language_code,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Customer English output could not be finalized.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="rounded-[16px] border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/36">
          <Languages className="h-3.5 w-3.5 text-[color:var(--flat-gold)]" />
          <span>{label}</span>
        </div>
        {state.status === "final" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-100">
            <CheckCircle2 className="h-3 w-3" />
            Finalized
          </span>
        ) : state.status === "draft" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[color:rgba(212,175,55,0.24)] bg-[color:rgba(212,175,55,0.08)] px-2 py-1 text-[11px] text-[#f7df97]">
            <Sparkles className="h-3 w-3" />
            Draft generated
          </span>
        ) : null}
      </div>

      {state.text ? (
        <textarea
          value={state.text}
          onChange={(event) =>
            onChange({
              ...state,
              text: event.target.value,
            })}
          disabled={readOnly || state.status === "final" || isBusy}
          className="mt-3 min-h-[88px] w-full rounded-[14px] border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-[color:rgba(212,175,55,0.34)] disabled:cursor-not-allowed disabled:opacity-80"
          placeholder="Generated customer English output will appear here."
        />
      ) : null}

      {isStale ? (
        <div className="mt-3 rounded-[14px] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          The line text changed after translation. Generate customer English again or save the current text without the old translation.
        </div>
      ) : null}

      {disabledReason && !state.text ? (
        <p className="mt-3 text-xs leading-5 text-white/44">{disabledReason}</p>
      ) : null}

      {errorMessage ? (
        <div className="mt-3 rounded-[14px] border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      {!readOnly ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(disabledReason) || isBusy || isFinalizedSelected}
            onClick={() => {
              void handleGenerate();
            }}
            className="inline-flex items-center gap-2 rounded-full border border-[color:rgba(212,175,55,0.24)] bg-[color:rgba(212,175,55,0.08)] px-3 py-2 text-xs uppercase tracking-[0.16em] text-[#f7df97] transition hover:border-[color:rgba(212,175,55,0.34)] hover:text-[#fde8a5] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {state.status === "draft" || isStale ? "Regenerate English" : "Generate English"}
          </button>
          {state.recordId && state.text && state.status !== "final" ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                void handleFinalize();
              }}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs uppercase tracking-[0.16em] text-emerald-100 transition hover:border-emerald-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Finalize English
            </button>
          ) : null}
          {state.recordId ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                onChange({
                  recordId: null,
                  text: null,
                  status: null,
                  sourceText: null,
                  sourceLanguageCode: null,
                })}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.16em] text-white/64 transition hover:border-rose-400/30 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <XCircle className="h-3.5 w-3.5" />
              Clear
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
