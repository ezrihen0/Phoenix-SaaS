"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  LogOut,
  MapPin,
  RefreshCw,
  Route,
  UserRound,
} from "lucide-react";

import DispatchStopCard from "@/app/dispatch/dispatch-stop-card";
import { metricTileHoverClassNameDark } from "@/components/board/metric-tile";
import { handleLogout } from "@/lib/auth/logout";
import { crmApiFetch } from "@/lib/crm/browser-api";
import {
  buildDispatchDayGroups,
  buildDispatchOptimizationSeed,
  buildDispatchStop,
  type DispatchJobRecord,
  type DispatchTechnicianRecord,
} from "@/lib/crm/dispatch";

function SectionFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,12,12,0.94),rgba(18,18,18,0.88))] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:p-6">
      <p className="text-[11px] uppercase tracking-[0.38em] text-white/36">{subtitle}</p>
      <h2 className="mt-3 font-[family:var(--font-flat-display)] text-3xl tracking-tight text-[#f5ecd2]">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <article className={`rounded-[24px] border border-white/10 bg-white/[0.04] p-4 ${metricTileHoverClassNameDark}`}>
      <p className="text-[11px] uppercase tracking-[0.28em] text-white/38">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
    </article>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2 text-sm text-white/66">
      <span>{label}</span>
      {children}
    </label>
  );
}

function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-[18px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-[color:rgba(212,175,55,0.34)] ${props.className ?? ""}`}
    />
  );
}

function FieldSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-[18px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition focus:border-[color:rgba(212,175,55,0.34)] ${props.className ?? ""}`}
    />
  );
}

function sortJobs(jobs: DispatchJobRecord[]) {
  return [...jobs].sort((left, right) => {
    if (left.scheduled_for && right.scheduled_for) {
      return new Date(left.scheduled_for).getTime() - new Date(right.scheduled_for).getTime();
    }

    if (left.scheduled_for) {
      return -1;
    }

    if (right.scheduled_for) {
      return 1;
    }

    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}

export default function DispatchWorkspace({
  initialJobs,
  technicians,
  initialErrorMessage,
}: {
  initialJobs: DispatchJobRecord[];
  technicians: DispatchTechnicianRecord[];
  initialErrorMessage: string | null;
}) {
  const router = useRouter();
  const t = useTranslations("dispatch");
  const [jobs, setJobs] = useState<DispatchJobRecord[]>(() => sortJobs(initialJobs));
  const [technicianFilter, setTechnicianFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialErrorMessage);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const stops = jobs.map((job) => buildDispatchStop(job));
  const visibleStops = stops.filter((stop) => {
    if (technicianFilter !== "all" && stop.technicianId !== technicianFilter) {
      return false;
    }

    if (dateFilter && stop.scheduledDayKey !== dateFilter) {
      return false;
    }

    return true;
  });
  const dayGroups = buildDispatchDayGroups(visibleStops);
  const optimizationSeed = buildDispatchOptimizationSeed(visibleStops);
  const effectiveSelectedStopId = selectedStopId && visibleStops.some((stop) => stop.id === selectedStopId)
    ? selectedStopId
    : (visibleStops[0]?.id ?? null);
  const selectedStop = visibleStops.find((stop) => stop.id === effectiveSelectedStopId) ?? null;
  const scheduledStopCount = visibleStops.filter((stop) => stop.scheduledDayKey).length;

  async function refreshJobs() {
    const nextJobs = await crmApiFetch<DispatchJobRecord[]>("/api/jobs");
    setJobs(sortJobs(nextJobs));
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[color:var(--flat-canvas)] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.16),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(191,87,0,0.16),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_32%)]" />
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:32px_32px]" />

      <div className="relative mx-auto max-w-[1600px] px-5 py-6 lg:px-8">
        <header className="rounded-[34px] border border-[color:rgba(212,175,55,0.18)] bg-[linear-gradient(180deg,rgba(9,9,9,0.94),rgba(18,18,18,0.88))] p-6 shadow-[0_34px_120px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.42em] text-[color:var(--flat-gold)]">
                {t("brand")}
              </p>
              <h1 className="mt-4 max-w-3xl font-[family:var(--font-flat-display)] text-5xl leading-none tracking-tight text-[#f5ecd2] sm:text-6xl">
                {t("title")}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/56 sm:text-base">
                {t("description")}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/jobs"
                className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white/72 transition hover:border-white/20 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("backToJobs")}
              </Link>
              <Link
                href="/schedule"
                className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white/72 transition hover:border-white/20 hover:text-white"
              >
                <CalendarDays className="h-4 w-4" />
                {t("scheduleView")}
              </Link>
              <button
                type="button"
                onClick={() => {
                  startTransition(() => {
                    void handleLogout(router);
                  });
                }}
                className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white/72 transition hover:border-white/20 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
                {t("signOut")}
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label={t("visibleStops")} value={visibleStops.length} />
            <MetricCard label={t("scheduledStops")} value={scheduledStopCount} />
            <MetricCard label={t("activeTechnicians")} value={technicians.length} />
            <MetricCard label={t("dateGroups")} value={dayGroups.length} />
          </div>
        </header>

        {(errorMessage || statusMessage) && (
          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className={`rounded-[22px] border px-4 py-3 text-sm ${errorMessage ? "border-rose-500/30 bg-rose-500/10 text-rose-100" : "border-[color:rgba(212,175,55,0.24)] bg-[color:rgba(212,175,55,0.1)] text-[#f5d980]"}`}>
              {errorMessage ?? statusMessage}
            </div>
            <button
              type="button"
              onClick={() => {
                startTransition(() => {
                  void (async () => {
                    try {
                      await refreshJobs();
                      setStatusMessage(t("refreshed"));
                      setErrorMessage(null);
                    } catch (error) {
                      setErrorMessage(error instanceof Error ? error.message : t("refreshError"));
                    }
                  })();
                });
              }}
              className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white/72 transition hover:border-white/20 hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
              {t("refreshDispatch")}
            </button>
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_420px]">
          <div className="space-y-6">
            <SectionFrame title={t("dispatchBoard")} subtitle={t("mapsStops")}>
              <div className="grid gap-4 lg:grid-cols-[0.8fr_0.8fr_auto]">
                <FieldLabel label={t("filterTechnician")}>
                  <FieldSelect value={technicianFilter} onChange={(event) => setTechnicianFilter(event.target.value)}>
                    <option value="all">{t("allTechnicians")}</option>
                    {technicians.map((technician) => (
                      <option key={technician.id} value={technician.id}>
                        {technician.display_name}
                      </option>
                    ))}
                  </FieldSelect>
                </FieldLabel>
                <FieldLabel label={t("filterDate")}>
                  <FieldInput type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
                </FieldLabel>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      setTechnicianFilter("all");
                      setDateFilter("");
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-white/10 px-4 py-3 text-sm text-white/72 transition hover:border-white/20 hover:text-white"
                  >
                    {t("clearFilters")}
                  </button>
                </div>
              </div>

              <div className="mt-6 space-y-5">
                {dayGroups.length > 0 ? dayGroups.map((dayGroup) => (
                  <section key={dayGroup.dayKey ?? "unscheduled"} className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--flat-gold)]">{t("dispatchDay")}</p>
                        <h3 className="mt-2 text-xl font-semibold text-[#f5ecd2]">{dayGroup.dayLabel}</h3>
                      </div>
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/56">
                        {t("stopCount", { count: dayGroup.stopCount })}
                      </span>
                    </div>

                    <div className="mt-4 space-y-4">
                      {dayGroup.technicians.map((cluster) => (
                        <div key={cluster.technicianId ?? "unassigned"} className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="inline-flex items-center gap-2 text-sm text-white/72">
                              <UserRound className="h-4 w-4 text-[color:var(--flat-gold)]" />
                              <span>{cluster.technicianLabel}</span>
                            </div>
                            <span className="text-xs text-white/46">{t("assignedStopCount", { count: cluster.stopCount })}</span>
                          </div>

                          <div className="mt-4 grid gap-3 lg:grid-cols-2">
                            {cluster.stops.map((stop) => (
                              <DispatchStopCard
                                key={stop.id}
                                stop={stop}
                                isSelected={effectiveSelectedStopId === stop.id}
                                onSelect={() => {
                                  setSelectedStopId(stop.id);
                                  setStatusMessage(null);
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )) : (
                  <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-10 text-center text-sm text-white/42">
                    {t("noStops")}
                  </div>
                )}
              </div>
            </SectionFrame>

            <SectionFrame title={t("routePrep")} subtitle={t("futureOptimization")}>
              <p className="text-sm leading-6 text-white/58">
                {t("routePrepDescription")}
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <MetricCard label={t("seedStops")} value={optimizationSeed.stopCount} />
                <MetricCard label={t("seedDays")} value={optimizationSeed.dayCount} />
                <MetricCard label={t("seedTechnicians")} value={optimizationSeed.technicianCount} />
              </div>
            </SectionFrame>
          </div>

          <div className="space-y-6 xl:sticky xl:top-5 xl:self-start">
            <SectionFrame title={t("selectedStop")} subtitle={t("dispatchDetail")}>
              {selectedStop ? (
                <div className="space-y-5">
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-lg font-semibold text-white">{selectedStop.title}</p>
                    <p className="mt-1 text-sm text-white/52">{selectedStop.customerLabel}</p>
                    <div className="mt-4 space-y-3 text-sm text-white/64">
                      <div className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 text-[color:var(--flat-gold)]" />
                        <span className="leading-6 text-white">{selectedStop.addressLabel}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-[color:var(--flat-gold)]" />
                        <span>{selectedStop.scheduledDayLabel} • {selectedStop.scheduledTimeLabel}{selectedStop.scheduledWindow ? ` • ${selectedStop.scheduledWindow}` : ""}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <UserRound className="h-4 w-4 text-[color:var(--flat-gold)]" />
                        <span>{selectedStop.technicianLabel}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-black/20 p-4 text-sm text-white/62">
                    <div className="flex items-center gap-2 text-white">
                      <Route className="h-4 w-4 text-[color:var(--flat-gold)]" />
                      <span>{t("routeHandoff")}</span>
                    </div>
                    <p className="mt-3 leading-6">
                      {t("routeHandoffDescription")}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <a
                        href={selectedStop.googleMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-[color:rgba(212,175,55,0.22)] px-4 py-2 text-sm text-[color:var(--flat-gold)] transition hover:border-[color:rgba(212,175,55,0.34)] hover:bg-[color:rgba(212,175,55,0.08)]"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {t("openInGoogleMaps")}
                      </a>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-10 text-center text-sm text-white/42">
                  {t("selectStop")}
                </div>
              )}
            </SectionFrame>
          </div>
        </div>
      </div>
    </main>
  );
}
