import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — PhoenixOS",
  description: "Privacy Policy for PhoenixOS (draft — legal review required).",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 lg:px-10 lg:py-20">
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        <strong className="font-semibold">DRAFT — LEGAL REVIEW REQUIRED.</strong> Replace this placeholder with a finalized Privacy Policy before production marketing or paid acquisition.
      </div>
      <h1 className="mt-8 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[#f5ecd2]">
        Privacy Policy
      </h1>
      <p className="mt-4 text-sm leading-7 text-white/55">
        Last updated placeholder: 2026-05-12. Data categories, subprocessors, retention, regional addenda (e.g. GDPR /
        CCPA), and contact details for privacy requests will be inserted here after legal review.
      </p>
      <section className="mt-10 space-y-4 text-sm leading-7 text-white/60">
        <p>
          This page exists to satisfy the Gate 14 requirement that a public Privacy route is present and loadable. It
          must be swapped for counsel-approved content before asserting compliance in customer contracts or ads.
        </p>
      </section>
    </main>
  );
}
