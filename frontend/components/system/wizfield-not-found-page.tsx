import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  ClipboardList,
  Gauge,
  Home,
  Map,
  MapPinOff,
  Package,
  RadioTower,
  ShieldCheck,
  Truck,
  Users,
  Wrench,
} from "lucide-react";

type RecoveryRoute = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const RECOVERY_ROUTES: RecoveryRoute[] = [
  { href: "/home", label: "Dashboard home", icon: Home },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/inspections", label: "Inspection Command Center", icon: ShieldCheck },
  { href: "/pricebook", label: "Pricebook", icon: Package },
  { href: "/settings", label: "Workspace settings", icon: Wrench },
];

export function WizFieldNotFoundPage() {
  return (
    <main className="sem-ai-grid-canvas relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <div aria-hidden="true" className="sem-ai-grid-dot-layer pointer-events-none absolute inset-0 [background-size:54px_54px]" />
      <div aria-hidden="true" className="sem-ai-grid-glow-layer pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="sem-ai-grid-vignette-layer pointer-events-none absolute inset-0" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[740px] w-[740px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[color:var(--sem-ai-node-border)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[540px] w-[540px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[color:var(--sem-ai-node-border)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[color:var(--sem-ai-node-border-selected)]"
      />

      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-4rem)] max-w-[1320px] items-center gap-10 px-5 py-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.75fr)] lg:px-8">
        <div>
          <div className="theme-status-warning inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.28em]">
            <MapPinOff className="h-3.5 w-3.5" />
            Dispatch route not found
          </div>

          <div className="mt-8 flex items-center gap-5">
            <div className="relative">
              <div
                aria-hidden="true"
                className="absolute inset-0 rounded-[34px] blur-2xl"
                style={{ background: "color-mix(in srgb, var(--sem-ai-grid-text-accent) 20%, transparent)" }}
              />
              <div className="sem-ai-node-card relative rounded-[34px] px-6 py-5 shadow-2xl">
                <p className="font-mono text-7xl font-black leading-none tracking-tighter text-[color:var(--sem-ai-grid-text-primary)] sm:text-8xl">
                  404
                </p>
              </div>
            </div>
            <div
              className="hidden h-px flex-1 sm:block"
              style={{
                background:
                  "linear-gradient(90deg, color-mix(in srgb, var(--sem-ai-grid-text-accent) 50%, transparent), color-mix(in srgb, var(--sem-ai-node-border) 40%, transparent), transparent)",
              }}
            />
          </div>

          <h1 className="mt-8 max-w-4xl text-5xl font-semibold tracking-tight text-[color:var(--sem-ai-grid-text-primary)] sm:text-6xl lg:text-7xl">
            This job route fell off the board.
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-8 text-[color:var(--sem-ai-grid-text-secondary)]">
            The page you&apos;re looking for is not available in this workspace. It may have been moved, restricted by role, or never existed. No customer, report, invoice, or workflow data was changed.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/home"
              className="theme-btn-primary group inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold"
            >
              <Home className="h-4 w-4" />
              Return to Command Home
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/inspections"
              className="theme-btn-secondary inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold"
            >
              <ClipboardList className="h-4 w-4" />
              Open Inspections
            </Link>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {[
              { icon: ShieldCheck, title: "Safe state", text: "Nothing was saved or deleted." },
              { icon: RadioTower, title: "Access check", text: "Your role may not have this route." },
              { icon: Wrench, title: "Recovery path", text: "Use the links to return cleanly." },
            ].map((item) => (
              <article key={item.title} className="sem-ai-node-card rounded-2xl p-4">
                <item.icon className="h-4 w-4 text-[color:var(--sem-ai-grid-text-accent)]" />
                <p className="mt-3 text-sm font-semibold text-[color:var(--sem-ai-grid-text-primary)]">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-[color:var(--sem-ai-grid-text-muted)]">{item.text}</p>
              </article>
            ))}
          </div>
        </div>

        <aside className="relative">
          <div
            aria-hidden="true"
            className="absolute -inset-6 rounded-[48px] blur-3xl"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--sem-ai-connector-output) 10%, transparent), color-mix(in srgb, var(--sem-ai-connector-trigger) 10%, transparent), transparent)",
            }}
          />
          <div className="sem-ai-inspector-surface relative overflow-hidden rounded-[42px] shadow-2xl">
            <div className="sem-ai-hud-bar border-b px-6 py-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[color:var(--sem-ai-grid-text-muted)]">Recovery panel</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--sem-ai-grid-text-primary)]">Route diagnostics</h2>
                </div>
                <Gauge className="h-5 w-5 text-[color:var(--sem-ai-grid-text-accent)]" />
              </div>
            </div>

            <div className="p-6">
              <div className="sem-ai-node-card rounded-[30px] p-5">
                <div className="sem-ai-grid-canvas relative h-64 overflow-hidden rounded-[24px] border border-[color:var(--sem-ai-node-border)]">
                  <div aria-hidden="true" className="sem-ai-grid-dot-layer pointer-events-none absolute inset-0 [background-size:18px_18px]" />
                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 260" fill="none" aria-hidden="true">
                    <path
                      d="M42 198 C110 70 176 212 246 90 C286 28 329 56 362 34"
                      stroke="var(--sem-ai-connector-output)"
                      strokeWidth="2"
                      strokeDasharray="8 8"
                      strokeOpacity="0.65"
                    />
                    <path
                      d="M42 198 C108 128 162 154 220 154 C282 154 310 116 362 94"
                      stroke="var(--sem-ai-connector-trigger)"
                      strokeWidth="2"
                      strokeOpacity="0.42"
                    />
                    <circle cx="42" cy="198" r="8" fill="var(--sem-ai-connector-output)" />
                    <circle cx="362" cy="34" r="8" fill="var(--sem-ai-connector-action)" />
                    <circle cx="248" cy="90" r="6" fill="var(--sem-state-error)" />
                  </svg>
                  <div className="theme-badge absolute left-4 top-4 rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em]">
                    route_status: missing
                  </div>
                  <div className="theme-control-surface absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs backdrop-blur-xl">
                    <Truck className="h-4 w-4 text-[color:var(--sem-ai-grid-text-accent)]" />
                    Field unit redirected
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                {RECOVERY_ROUTES.map((route) => (
                  <Link
                    key={route.href}
                    href={route.href}
                    className="theme-control-surface group flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="theme-control-surface-soft rounded-xl p-2 text-[color:var(--sem-ai-grid-text-muted)] transition group-hover:text-[color:var(--sem-ai-grid-text-accent)]">
                        <route.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[color:var(--sem-ai-grid-text-primary)]">{route.label}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-[color:var(--sem-ai-grid-text-muted)]">{route.href}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-[color:var(--sem-ai-grid-text-muted)] transition group-hover:translate-x-0.5 group-hover:text-[color:var(--sem-ai-grid-text-accent)]" />
                  </Link>
                ))}
              </div>

              <div className="theme-alert-warning mt-5 rounded-2xl border p-4">
                <div className="flex gap-3">
                  <Map className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="text-xs leading-5">
                    If this route should exist, check the URL, organization context, and role permissions before creating a new link.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
