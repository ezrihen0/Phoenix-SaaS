"use client";

import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Flame,
  LockKeyhole,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react";

import {
  getClientDestination,
  loginWithPassword,
} from "@/lib/auth/client-auth";

export const SHOW_LEGACY_LOGIN = false;

const LOGIN_ATMOSPHERE_STORAGE_KEY = "wizfield.login.atmosphere";

type LoginAtmosphere = "default" | "dark";

/** Hardware / Obsidian premium login atmosphere (local override only). */
const LOGIN_DARK_AUTH_VARS: CSSProperties = {
  "--sem-auth-canvas": "#09090b",
  "--sem-auth-foreground": "#0f172a",
  "--sem-auth-grid-line": "rgba(255, 255, 255, 0.065)",
  "--sem-auth-grid-size": "40px",
  "--sem-auth-grid-opacity": "0.25",
  "--sem-auth-glow-1": "color-mix(in srgb, #4D00FF 20%, transparent)",
  "--sem-auth-glow-2": "color-mix(in srgb, #8b5cf6 16%, transparent)",
  "--sem-auth-glow-3": "color-mix(in srgb, #00F5A0 10%, transparent)",
  "--sem-auth-vignette":
    "radial-gradient(circle at center, transparent 0%, color-mix(in srgb, #09090b 18%, transparent) 52%, color-mix(in srgb, #09090b 78%, transparent) 100%)",
  "--sem-auth-card-bg": "rgba(255, 255, 255, 0.95)",
  "--sem-auth-card-border": "rgba(255, 255, 255, 0.2)",
  "--sem-auth-card-shadow": "0 32px 96px rgba(15, 23, 42, 0.24)",
} as CSSProperties;

function useLoginAtmosphere() {
  const [atmosphere, setAtmosphere] = useState<LoginAtmosphere>("default");

  useEffect(() => {
    const stored = window.localStorage.getItem(LOGIN_ATMOSPHERE_STORAGE_KEY);

    if (stored === "dark" || stored === "default") {
      setAtmosphere(stored);
    }
  }, []);

  function toggleAtmosphere() {
    setAtmosphere((current) => {
      const next: LoginAtmosphere = current === "dark" ? "default" : "dark";
      window.localStorage.setItem(LOGIN_ATMOSPHERE_STORAGE_KEY, next);
      return next;
    });
  }

  return { atmosphere, toggleAtmosphere };
}

function LoginAtmosphereToggle({
  atmosphere,
  onToggle,
}: {
  atmosphere: LoginAtmosphere;
  onToggle: () => void;
}) {
  const isDark = atmosphere === "dark";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isDark}
      aria-label={isDark ? "Use theme default login atmosphere" : "Use dark premium login atmosphere"}
      className="fixed top-5 right-5 z-20 inline-flex items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--sem-auth-card-border)_85%,transparent)] bg-[color:color-mix(in_srgb,var(--sem-auth-card-bg)_82%,transparent)] px-3 py-1.5 text-xs font-semibold text-[color:var(--sem-auth-foreground)] shadow-[var(--sem-auth-card-shadow)] backdrop-blur-md transition hover:border-[color:var(--sem-auth-card-border)] sm:top-6 sm:right-6"
    >
      {isDark ? <Sun className="h-3.5 w-3.5 shrink-0 opacity-80" /> : <Moon className="h-3.5 w-3.5 shrink-0 opacity-80" />}
      <span>{isDark ? "Bright mode" : "Dark mode"}</span>
    </button>
  );
}

function LoadingSpinner() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
      aria-hidden="true"
    />
  );
}

export function LoginAmbientShell({ children }: { children: ReactNode }) {
  const { atmosphere, toggleAtmosphere } = useLoginAtmosphere();
  const isDarkAtmosphere = atmosphere === "dark";

  return (
    <main
      data-login-atmosphere={atmosphere}
      style={isDarkAtmosphere ? LOGIN_DARK_AUTH_VARS : undefined}
      className="sem-auth-atmosphere relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10"
    >
      <LoginAtmosphereToggle atmosphere={atmosphere} onToggle={toggleAtmosphere} />
      <div aria-hidden="true" className="sem-auth-grid-layer pointer-events-none absolute inset-0" />
      <div
        aria-hidden="true"
        className="sem-auth-glow-1 pointer-events-none absolute left-1/2 top-1/2 h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2"
      />
      <div
        aria-hidden="true"
        className="sem-auth-glow-2 pointer-events-none absolute left-[42%] top-[38%] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2"
      />
      <div
        aria-hidden="true"
        className="sem-auth-glow-3 pointer-events-none absolute left-[62%] top-[68%] h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2"
      />
      <div aria-hidden="true" className="sem-auth-vignette-layer pointer-events-none absolute inset-0" />
      <div className="relative z-10 w-full">{children}</div>
    </main>
  );
}

export function LoginSessionLoading() {
  return (
    <section className="mx-auto w-full max-w-[460px]">
      <div className="sem-auth-card rounded-[32px] p-8 backdrop-blur-2xl">
        <div className="flex flex-col items-center py-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-slate-950 text-white shadow-[0_24px_60px_rgba(15,23,42,0.28)]">
            <Flame className="h-8 w-8" />
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.32em] text-slate-400">
            Secure workspace access
          </p>
          <div className="mt-6 flex items-center gap-3 text-sm font-medium text-slate-600">
            <LoadingSpinner />
            <span>Checking session...</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function getStatusMessage(nextPath: string | null) {
  if (nextPath === "/pricing") {
    return "Sign in to continue with subscription activation for your WizField workspace.";
  }

  return null;
}

function getReasonMessage(reason: string | null) {
  if (reason === "unsupported-account") {
    return "This account is not authorized for the requested workspace. Sign in with a supported role or contact your administrator.";
  }

  if (reason === "role-resolution-failed") {
    return "Your previous session could not resolve a workspace destination. Sign in again to continue.";
  }

  return null;
}

function CenteredLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  const reason = searchParams.get("reason");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const contextMessage = getReasonMessage(reason) ?? getStatusMessage(nextPath);

  async function completePasswordLogin() {
    const response = await getClientDestination();
    const destination = response.destination as string | null;

    if (!destination) {
      throw new Error(
        "This account authenticated successfully, but no supported WizField dashboard destination is assigned yet.",
      );
    }

    const nextDestination = nextPath && nextPath === destination
      ? nextPath
      : destination;

    router.replace(nextDestination ?? "/pricing");
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
    setStatusMessage(
      "After you sign in, open Reset Password to set a new password. If you are locked out, contact an administrator.",
    );
  }

  return (
    <LoginAmbientShell>
      <section className="mx-auto w-full max-w-[460px]">
        <div className="sem-auth-card rounded-[32px] p-7 backdrop-blur-2xl sm:p-8">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-slate-950 text-white shadow-[0_24px_60px_rgba(15,23,42,0.28)]">
              <Flame className="h-8 w-8" />
            </div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.32em] text-slate-400">
              Secure workspace access
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Sign in to WizField
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">
              Enter your credentials to access your command center.
            </p>
            {contextMessage ? (
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">
                {contextMessage}
              </p>
            ) : null}
          </div>

          {errorMessage ? (
            <div className="mt-7 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Authentication failed</p>
                  <p className="mt-1 text-sm leading-5 text-rose-700">{errorMessage}</p>
                </div>
              </div>
            </div>
          ) : null}

          {statusMessage ? (
            <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
              <p className="text-sm leading-6">{statusMessage}</p>
            </div>
          ) : null}

          <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Email address</span>
              <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 transition focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100">
                <Mail className="h-5 w-5 shrink-0 text-slate-400" />
                <input
                  required
                  autoComplete="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
                  placeholder="you@company.com"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Password</span>
              <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 transition focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
                <LockKeyhole className="h-5 w-5 shrink-0 text-slate-400" />
                <input
                  required
                  autoComplete="current-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
                  placeholder="Enter your password"
                />
              </div>
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  handlePasswordRecovery();
                }}
                className="text-sm font-semibold text-slate-700 transition hover:text-slate-950"
              >
                Password help
              </button>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-semibold text-white shadow-[0_22px_48px_rgba(15,23,42,0.24)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              {isSubmitting ? <LoadingSpinner /> : null}
              <span>{isSubmitting ? "Securing session..." : "Sign in"}</span>
              {!isSubmitting ? <ArrowRight className="h-4 w-4" /> : null}
            </button>
          </form>

          <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" />
              <p className="text-sm leading-6 text-slate-600">
                Your destination is resolved securely after authentication based on role, organization, and activation status.
              </p>
            </div>
          </div>

          <div className="mt-7 text-center text-xs leading-5 text-slate-500">
            <p>
              Need access?{" "}
              <Link href="/signup" className="font-semibold text-slate-700 transition hover:text-slate-950">
                Create an account
              </Link>
              ,{" "}
              <Link href="/contact" className="font-semibold text-slate-700 transition hover:text-slate-950">
                Contact
              </Link>
              , or read the{" "}
              <Link href="/landing" className="font-semibold text-slate-700 transition hover:text-slate-950">
                overview
              </Link>
              .
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <Link href="/pricing" className="transition hover:text-slate-950">
                Pricing
              </Link>
              <Link href="/terms" className="transition hover:text-slate-950">
                Terms
              </Link>
              <Link href="/privacy" className="transition hover:text-slate-950">
                Privacy
              </Link>
            </div>
          </div>
        </div>
      </section>
    </LoginAmbientShell>
  );
}

function LegacyLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function getLegacyStatusMessage(next: string | null) {
    if (next === "/pricing") {
      return "Sign in to continue with subscription activation for your WizField workspace.";
    }

    return "Sign in to run leads, jobs, dispatch, estimates, invoices, and customer history in one WizField workspace.";
  }

  async function completePasswordLogin() {
    const response = await getClientDestination();
    const destination = response.destination as string | null;

    if (!destination) {
      throw new Error(
        "This account authenticated successfully, but no supported WizField dashboard destination is assigned yet.",
      );
    }

    const nextDestination = nextPath && nextPath === destination
      ? nextPath
      : destination;

    router.replace(nextDestination ?? "/pricing");
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
    setStatusMessage(
      "After you sign in, open Reset Password to set a new password. If you are locked out, contact an administrator.",
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[color:var(--flat-canvas)] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.18),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(191,87,0,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_32%)]" />

      <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-12 px-6 py-10 lg:grid-cols-[minmax(0,1.1fr)_480px] lg:px-10">
        <section className="max-w-2xl">
          <p className="text-[11px] uppercase tracking-[0.42em] text-[color:var(--flat-gold)]">
            WizField
          </p>
          <h1 className="mt-5 max-w-xl font-[family:var(--font-flat-display)] text-5xl leading-none tracking-tight text-[#f5ecd2] md:text-7xl">
            Dispatch the workday before the first truck rolls.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-white/62 md:text-lg">
            A field-service operating system for owners who are tired of losing calls, jobs, estimates, invoices, and
            customer history — in one operational workspace.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: Flame,
                title: "Lead to Paid",
                body: "Track each job from first contact through completion and payment without losing the thread.",
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
            {getLegacyStatusMessage(nextPath)}
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
                  placeholder="office@example.com"
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
              handlePasswordRecovery();
            }}
            className="mt-4 text-sm text-white/54 transition hover:text-white"
          >
            Password help
          </button>

          <div className="mt-8 border-t border-white/10 pt-6 text-xs leading-5 text-white/45">
            <p>
              Need access? You can{" "}
              <Link href="/signup" className="text-[color:var(--flat-gold)] underline-offset-2 hover:underline">
                create an account
              </Link>
              {" "}or use{" "}
              <Link href="/contact" className="text-[color:var(--flat-gold)] underline-offset-2 hover:underline">
                Contact
              </Link>{" "}
              or read the{" "}
              <Link href="/landing" className="text-[color:var(--flat-gold)] underline-offset-2 hover:underline">
                overview
              </Link>
              ,{" "}
              <Link href="/pricing" className="text-[color:var(--flat-gold)] underline-offset-2 hover:underline">
                pricing model
              </Link>
              ,{" "}
              <Link href="/terms" className="text-[color:var(--flat-gold)] underline-offset-2 hover:underline">
                Terms
              </Link>
              , and{" "}
              <Link href="/privacy" className="text-[color:var(--flat-gold)] underline-offset-2 hover:underline">
                Privacy
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function LoginForm() {
  if (SHOW_LEGACY_LOGIN) {
    return <LegacyLoginForm />;
  }

  return <CenteredLoginForm />;
}
