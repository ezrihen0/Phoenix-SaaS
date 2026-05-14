import type { Metadata } from "next";
import Link from "next/link";

const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@example.com";

export const metadata: Metadata = {
  title: "Contact — WizField",
  description: "Contact WizField for access, support, and founding customer conversations.",
};

export default function ContactPage() {
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("WizField — access or support")}`;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 lg:px-10 lg:py-20">
      <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--flat-gold)]">Contact</p>
      <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[#f5ecd2] sm:text-5xl">
        Talk to the team
      </h1>
      <p className="mt-5 text-base leading-7 text-white/65">
        For founding access, pilot onboarding, and billing questions, email the address below. Existing customer
        organizations should continue to use the contact channels their admin provided.
      </p>
      <div className="mt-10 rounded-[28px] border border-white/10 bg-white/[0.04] p-6 sm:p-8">
        <p className="text-[11px] uppercase tracking-[0.28em] text-white/45">Prospect and operator email</p>
        <a
          href={mailto}
          className="mt-3 inline-flex text-lg font-medium text-[color:var(--flat-gold)] underline-offset-4 hover:underline"
        >
          {SUPPORT_EMAIL}
        </a>
        {SUPPORT_EMAIL === "support@example.com" ? (
          <p className="mt-4 text-sm text-white/45">
            Set <code className="rounded bg-black/40 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_SUPPORT_EMAIL</code> in your
            deployment environment to replace this placeholder.
          </p>
        ) : null}
      </div>
      <p className="mt-8 text-sm text-white/50">
        Already have credentials?{" "}
        <Link href="/login" className="text-[color:var(--flat-gold)] underline-offset-2 hover:underline">
          Sign in
        </Link>
        .
      </p>
    </main>
  );
}
