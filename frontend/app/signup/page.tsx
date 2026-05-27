"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { ArrowRight, Building2, Mail, ShieldCheck, UserRound } from "lucide-react";

import { MarketingFunnelShell } from "@/components/marketing-funnel-shell";
import {
  getClientDestination,
  registerWithPassword,
} from "@/lib/auth/client-auth";

function passwordStrengthLabel(password: string) {
  if (password.length === 0) {
    return null;
  }

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) {
    return { label: "Weak", className: "text-rose-300" };
  }

  if (score <= 3) {
    return { label: "Fair", className: "text-amber-200" };
  }

  return { label: "Strong", className: "text-emerald-300" };
}

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const strength = useMemo(() => passwordStrengthLabel(password), [password]);

  async function completeSignup() {
    const response = await getClientDestination();
    const destination = response.destination as string | null;

    if (!destination) {
      throw new Error(
        "Your account was created, but no supported WizField dashboard destination is assigned yet.",
      );
    }

    router.replace(destination);
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!acceptedTerms) {
      setErrorMessage("Please accept the Terms and Privacy Policy to continue.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await registerWithPassword({
        email: email.trim().toLowerCase(),
        password,
        fullName: fullName.trim(),
        organizationName: organizationName.trim(),
      });
      await completeSignup();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create your account right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <MarketingFunnelShell>
      <main className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.18),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(191,87,0,0.12),transparent_30%)]" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 py-10 lg:grid-cols-[minmax(0,1.05fr)_520px] lg:px-10">
          <section className="max-w-2xl">
            <p className="text-[11px] uppercase tracking-[0.42em] text-[color:var(--flat-gold)]">WizField</p>
            <h1 className="mt-5 max-w-xl font-[family:var(--font-flat-display)] text-5xl leading-none tracking-tight text-[color:var(--sem-display-headline)] md:text-7xl">
              Create your WizField workspace.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[color:var(--sem-text-secondary)] md:text-lg">
              Create your owner account and your first business. Your workspace will be prepared for activation through
              WizField&apos;s shared billing flow with Stripe as the checkout provider.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                { icon: UserRound, title: "Owner account", body: "Create a secure login tied to one global user identity." },
                { icon: Building2, title: "First business", body: "Your first organization is prepared as the workspace you will activate next." },
                { icon: ShieldCheck, title: "Shared billing model", body: "New workspaces link to the same shared billing account and count against the current business entitlement." },
              ].map(({ icon: Icon, title, body }) => (
                <article key={title} className="rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:rgba(212,175,55,0.22)] bg-[color:rgba(212,175,55,0.12)] text-[color:var(--flat-gold)]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h2 className="mt-4 text-lg font-semibold tracking-tight text-[color:var(--sem-text-primary)]">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[36px] border border-[color:rgba(212,175,55,0.2)] bg-[linear-gradient(180deg,rgba(11,11,11,0.96),rgba(18,18,18,0.9))] p-7 shadow-[0_36px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:p-9">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.38em] text-[color:var(--sem-text-muted)]">Create Account</p>
                <h2 className="mt-3 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)]">
                  Create My Workspace
                </h2>
              </div>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:rgba(212,175,55,0.22)] bg-[color:rgba(212,175,55,0.1)] text-[color:var(--flat-gold)]">
                <ShieldCheck className="h-5 w-5" />
              </span>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <label className="block space-y-2 text-sm text-[color:var(--sem-text-secondary)]">
                <span>Full name</span>
                <div className="flex items-center gap-3 rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-4 py-3 transition focus-within:border-[color:var(--cmp-border-accent)]">
                  <UserRound className="h-4 w-4 text-[color:var(--flat-gold)]" />
                  <input required value={fullName} onChange={(event) => setFullName(event.target.value)} className="w-full bg-transparent text-[color:var(--sem-text-primary)] outline-none placeholder:text-[color:var(--sem-text-muted)]" placeholder="Jordan Smith" />
                </div>
              </label>

              <label className="block space-y-2 text-sm text-[color:var(--sem-text-secondary)]">
                <span>Business Name</span>
                <div className="flex items-center gap-3 rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-4 py-3 transition focus-within:border-[color:var(--cmp-border-accent)]">
                  <Building2 className="h-4 w-4 text-[color:var(--flat-gold)]" />
                  <input required value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} className="w-full bg-transparent text-[color:var(--sem-text-primary)] outline-none placeholder:text-[color:var(--sem-text-muted)]" placeholder="Jordan Chimney & Fireplace" />
                </div>
              </label>

              <label className="block space-y-2 text-sm text-[color:var(--sem-text-secondary)]">
                <span>Email</span>
                <div className="flex items-center gap-3 rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-4 py-3 transition focus-within:border-[color:var(--cmp-border-accent)]">
                  <Mail className="h-4 w-4 text-[color:var(--flat-gold)]" />
                  <input required autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full bg-transparent text-[color:var(--sem-text-primary)] outline-none placeholder:text-[color:var(--sem-text-muted)]" placeholder="owner@example.com" />
                </div>
              </label>

              <label className="block space-y-2 text-sm text-[color:var(--sem-text-secondary)]">
                <span>Password</span>
                <div className="flex items-center gap-3 rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-4 py-3 transition focus-within:border-[color:var(--cmp-border-accent)]">
                  <ShieldCheck className="h-4 w-4 text-[color:var(--flat-gold)]" />
                  <input required autoComplete="new-password" type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full bg-transparent text-[color:var(--sem-text-primary)] outline-none placeholder:text-[color:var(--sem-text-muted)]" placeholder="Use at least 8 characters" />
                </div>
                {strength ? (
                  <p className={`text-xs ${strength.className}`}>Password strength: {strength.label}</p>
                ) : null}
              </label>

              <label className="flex items-start gap-3 text-sm text-[color:var(--sem-text-secondary)]">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(event) => setAcceptedTerms(event.target.checked)}
                  className="theme-input-control mt-1 h-4 w-4 rounded"
                />
                <span>
                  I agree to the{" "}
                  <Link href="/terms" className="text-[color:var(--flat-gold)] underline-offset-2 hover:underline">Terms</Link>
                  {" "}and{" "}
                  <Link href="/privacy" className="text-[color:var(--flat-gold)] underline-offset-2 hover:underline">Privacy Policy</Link>.
                </span>
              </label>

              {errorMessage ? (
                <div className="rounded-[22px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {errorMessage}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting || !acceptedTerms}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[22px] border border-[color:rgba(212,175,55,0.28)] bg-[linear-gradient(135deg,rgba(212,175,55,0.24),rgba(212,175,55,0.08))] px-5 py-3.5 text-sm font-medium text-[#f7df97] transition hover:bg-[linear-gradient(135deg,rgba(212,175,55,0.3),rgba(212,175,55,0.12))] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>{isSubmitting ? "Creating workspace..." : "Create My Workspace"}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </section>
        </div>
      </main>
    </MarketingFunnelShell>
  );
}
