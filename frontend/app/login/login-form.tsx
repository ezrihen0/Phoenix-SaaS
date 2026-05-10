"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Flame,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";

import {
  getClientDestination,
  loginWithPassword,
} from "@/lib/auth/client-auth";

function getStatusMessage(nextPath: string | null) {
  if (nextPath === "/technician") {
    return "Sign in to open the technician board and update field progress in real time.";
  }

  return "Sign in to manage leads, jobs, scheduling, estimates, invoices, and follow-up from one workspace.";
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingRecovery, setIsSendingRecovery] = useState(false);

  async function completePasswordLogin() {
    const response = await getClientDestination();
    const destination = response.destination as string | null;

    if (!destination) {
      throw new Error(
        "This account authenticated successfully, but no supported Phoenix Fireplace CRM dashboard is assigned yet.",
      );
    }

    const nextDestination = nextPath && nextPath === destination
      ? nextPath
      : destination;

    router.replace(nextDestination);
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setErrorMessage("Enter your email address to continue.");
      return;
    }

    if (!password) {
      setErrorMessage("Enter your password to continue.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await loginWithPassword(normalizedEmail, password);
      await completePasswordLogin();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to sign in right now.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasswordRecovery() {
    setErrorMessage(null);
    setStatusMessage(null);

    setIsSendingRecovery(true);

    try {
      setStatusMessage(
        "Sign in, then open Reset Password to set a new password. If you are locked out, contact an administrator.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to send a password reset link right now.",
      );
    } finally {
      setIsSendingRecovery(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[color:var(--flat-canvas)] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.18),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(191,87,0,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_32%)]" />

      <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-12 px-6 py-10 lg:grid-cols-[minmax(0,1.1fr)_480px] lg:px-10">
        <section className="max-w-2xl">
          <p className="text-[11px] uppercase tracking-[0.42em] text-[color:var(--flat-gold)]">
            Phoenix Fireplace CRM
          </p>
          <h1 className="mt-5 max-w-xl font-[family:var(--font-flat-display)] text-5xl leading-none tracking-tight text-[#f5ecd2] md:text-7xl">
            Dispatch the workday before the first truck rolls.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-white/62 md:text-lg">
            One operational workspace for lead intake, job scheduling, technician dispatch, field findings, estimates, invoices, and customer follow-up.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: Flame,
                title: "Lead to Paid",
                body: "Track each fireplace job from first contact through completion and payment.",
              },
              {
                icon: ShieldCheck,
                title: "Office Control",
                body: "Schedule work, assign technicians, and keep notes, quotes, and invoices attached to the same record.",
              },
              {
                icon: LockKeyhole,
                title: "Field Ready",
                body: "Technicians update status and findings without juggling spreadsheets or text threads.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <article
                key={title}
                className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:rgba(212,175,55,0.22)] bg-[color:rgba(212,175,55,0.12)] text-[color:var(--flat-gold)]">
                  <Icon className="h-4 w-4" />
                </span>
                <h2 className="mt-4 text-lg font-semibold tracking-tight text-white">
                  {title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/56">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[36px] border border-[color:rgba(212,175,55,0.2)] bg-[linear-gradient(180deg,rgba(11,11,11,0.96),rgba(18,18,18,0.9))] p-7 shadow-[0_36px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:p-9">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.38em] text-white/40">
                Secure Login
              </p>
              <h2 className="mt-3 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[#f5ecd2]">
                Open the operations board
              </h2>
            </div>
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:rgba(212,175,55,0.22)] bg-[color:rgba(212,175,55,0.1)] text-[color:var(--flat-gold)]">
              <ShieldCheck className="h-5 w-5" />
            </span>
          </div>

          <p className="mt-5 text-sm leading-6 text-white/58">
            {getStatusMessage(nextPath)}
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block space-y-2 text-sm text-white/68">
              <span>Email</span>
              <div className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-black/35 px-4 py-3 transition focus-within:border-[color:rgba(212,175,55,0.36)]">
                <Mail className="h-4 w-4 text-[color:var(--flat-gold)]" />
                <input
                  required
                  autoComplete="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full bg-transparent text-white outline-none placeholder:text-white/28"
                  placeholder="office@phoenixfireplace.com"
                />
              </div>
            </label>

            <label className="block space-y-2 text-sm text-white/68">
              <span>Password</span>
              <div className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-black/35 px-4 py-3 transition focus-within:border-[color:rgba(212,175,55,0.36)]">
                <LockKeyhole className="h-4 w-4 text-[color:var(--flat-gold)]" />
                <input
                  required
                  autoComplete="current-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full bg-transparent text-white outline-none placeholder:text-white/28"
                  placeholder="Enter your password"
                />
              </div>
            </label>

            {errorMessage ? (
              <div className="rounded-[22px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {errorMessage}
              </div>
            ) : null}

            {statusMessage ? (
              <div className="rounded-[22px] border border-[color:rgba(212,175,55,0.28)] bg-[color:rgba(212,175,55,0.1)] px-4 py-3 text-sm text-[#f5d980]">
                {statusMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[22px] border border-[color:rgba(212,175,55,0.28)] bg-[linear-gradient(135deg,rgba(212,175,55,0.24),rgba(212,175,55,0.08))] px-5 py-3.5 text-sm font-medium text-[#f7df97] transition hover:bg-[linear-gradient(135deg,rgba(212,175,55,0.3),rgba(212,175,55,0.12))] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{isSubmitting ? "Signing in..." : "Sign in"}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              void handlePasswordRecovery();
            }}
            disabled={isSendingRecovery}
            className="mt-4 text-sm text-white/54 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSendingRecovery ? "Sending reset link..." : "Reset password"}
          </button>
        </section>
      </div>
    </main>
  );
}
