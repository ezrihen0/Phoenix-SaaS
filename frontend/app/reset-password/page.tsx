"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";

import {
  getClientSession,
  updateCurrentPassword,
} from "@/lib/auth/client-auth";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    "Validating your secure recovery link...",
  );
  const [isRecoveryReady, setIsRecoveryReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function hydrateRecoverySession() {
      const session = await getClientSession().catch(() => null);

      if (!isActive) {
        return;
      }

      if (session) {
        setIsRecoveryReady(true);
        setStatusMessage("Recovery session confirmed. Set a new password to continue.");
        return;
      }

      setIsRecoveryReady(false);
      setStatusMessage(
        "Sign in first to update your password from this page.",
      );
    }

    void hydrateRecoverySession();

    return () => {
      isActive = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (password.length < 8) {
      setErrorMessage("Use at least 8 characters for your new password.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("The password confirmation does not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      await updateCurrentPassword(password);

      setStatusMessage("Password updated. Routing you into Phoenix Fireplace CRM.");
      window.location.assign("/jobs");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update your password right now.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[color:var(--flat-canvas)] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.16),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(80,200,120,0.12),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_30%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-3xl items-center px-6 py-10 lg:px-10">
        <section className="w-full rounded-[36px] border border-[color:rgba(212,175,55,0.2)] bg-[linear-gradient(180deg,rgba(11,11,11,0.96),rgba(18,18,18,0.9))] p-7 shadow-[0_36px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.38em] text-white/40">
                Password Recovery
              </p>
              <h1 className="mt-3 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[#f5ecd2]">
                Reset your CRM password
              </h1>
            </div>
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:rgba(212,175,55,0.22)] bg-[color:rgba(212,175,55,0.1)] text-[color:var(--flat-gold)]">
              <ShieldCheck className="h-5 w-5" />
            </span>
          </div>

          <p className="mt-4 text-sm leading-6 text-white/58">
            {statusMessage}
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2 text-sm text-white/68">
              <span>New Password</span>
              <div className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-black/35 px-4 py-3 transition focus-within:border-[color:rgba(212,175,55,0.36)]">
                <LockKeyhole className="h-4 w-4 text-[color:var(--flat-gold)]" />
                <input
                  required
                  autoComplete="new-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full bg-transparent text-white outline-none placeholder:text-white/28"
                  placeholder="Use at least 8 characters"
                />
              </div>
            </label>

            <label className="block space-y-2 text-sm text-white/68">
              <span>Confirm Password</span>
              <div className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-black/35 px-4 py-3 transition focus-within:border-[color:rgba(212,175,55,0.36)]">
                <LockKeyhole className="h-4 w-4 text-[color:var(--flat-gold)]" />
                <input
                  required
                  autoComplete="new-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full bg-transparent text-white outline-none placeholder:text-white/28"
                  placeholder="Retype your new password"
                />
              </div>
            </label>

            {errorMessage ? (
              <div className="rounded-[22px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {errorMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!isRecoveryReady || isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[22px] border border-[color:rgba(212,175,55,0.28)] bg-[linear-gradient(135deg,rgba(212,175,55,0.24),rgba(212,175,55,0.08))] px-5 py-3.5 text-sm font-medium text-[#f7df97] transition hover:bg-[linear-gradient(135deg,rgba(212,175,55,0.3),rgba(212,175,55,0.12))] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{isSubmitting ? "Updating password..." : "Update password"}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-6 text-sm text-white/48">
            <Link href="/login" className="text-[color:var(--flat-gold)] transition hover:text-[#f7df97]">
              Back to sign in
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}