import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — PhoenixOS",
  description: "Terms of Service for PhoenixOS (draft — legal review required).",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 lg:px-10 lg:py-20">
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        <strong className="font-semibold">DRAFT — LEGAL REVIEW REQUIRED.</strong> Replace this placeholder with counsel-approved Terms before relying on it for customers or paid acquisition.
      </div>
      <h1 className="mt-8 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[#f5ecd2]">
        Terms of Service
      </h1>
      <p className="mt-4 text-sm leading-7 text-white/55">
        Last updated placeholder: 2026-05-12. Operator legal name, governing law, SLA, data processing terms, limitation
        of liability, and dispute resolution will be inserted here after legal review.
      </p>
      <section className="mt-10 space-y-4 text-sm leading-7 text-white/60">
        <p>
          This document is a structural placeholder so launch readiness can verify that a{" "}
          <code className="rounded bg-black/40 px-1.5 py-0.5 text-xs">/terms</code> route exists and loads. It is not
          legal advice and not binding language.
        </p>
      </section>
    </main>
  );
}
