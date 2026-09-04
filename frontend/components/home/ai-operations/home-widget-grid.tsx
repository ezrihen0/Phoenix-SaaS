"use client";

import { BriefcaseBusiness, CalendarDays, CircleDollarSign, ClipboardList, Users } from "lucide-react";
import Link from "next/link";

import { formatCurrencyFromCents } from "@/lib/crm/invoice-line-model";
import type { HomeAiWidgetsResponse } from "@/lib/ai/home-ai-types";

const panelClass =
  "theme-surface-card rounded-[20px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-4 backdrop-blur-md";

function WidgetCard({
  icon: Icon,
  label,
  value,
  helper,
  href,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  helper?: string;
  href?: string;
}) {
  const content = (
    <article className={`${panelClass} h-full transition hover:border-[color:var(--cmp-border-accent)]`}>
      <div className="flex items-start justify-between gap-3">
        <div className="theme-status-info flex h-10 w-10 items-center justify-center rounded-2xl border">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-[color:var(--sem-display-headline)]">{value}</p>
      {helper ? (
        <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">{helper}</p>
      ) : null}
    </article>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

export function HomeWidgetGrid({ widgets }: { widgets: HomeAiWidgetsResponse["widgets"] | null }) {
  if (!widgets) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className={`${panelClass} h-32 animate-pulse bg-[color:var(--cmp-surface-soft)]`} />
        ))}
      </div>
    );
  }

  const cards = [];

  if (widgets.today?.visible) {
    cards.push(
      <WidgetCard
        key="today"
        icon={CalendarDays}
        label={widgets.today.label ?? "Today"}
        value={String(widgets.today.count ?? 0)}
        helper="scheduled"
        href={widgets.today.href}
      />,
    );
  }

  if (widgets.leads?.visible) {
    cards.push(
      <WidgetCard
        key="leads"
        icon={ClipboardList}
        label={widgets.leads.label ?? "Leads"}
        value={String(widgets.leads.count ?? 0)}
        helper="open pipeline"
        href={widgets.leads.href}
      />,
    );
  }

  if (widgets.jobs?.visible) {
    cards.push(
      <WidgetCard
        key="jobs"
        icon={BriefcaseBusiness}
        label={widgets.jobs.label ?? "Jobs"}
        value={String(widgets.jobs.count ?? 0)}
        helper="active"
        href={widgets.jobs.href}
      />,
    );
  }

  if (widgets.customers?.visible) {
    cards.push(
      <WidgetCard
        key="customers"
        icon={Users}
        label={widgets.customers.label ?? "Total customers"}
        value={String(widgets.customers.count ?? 0)}
        helper="full ledger"
        href={widgets.customers.href}
      />,
    );
  }

  if (widgets.money?.visible) {
    cards.push(
      <WidgetCard
        key="money"
        icon={CircleDollarSign}
        label={widgets.money.label ?? "Money"}
        value={formatCurrencyFromCents(widgets.money.totalBalanceCents ?? 0)}
        helper={`${widgets.money.count ?? 0} unpaid`}
        href={widgets.money.href}
      />,
    );
  }

  if (cards.length === 0) {
    return null;
  }

  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards}</div>;
}
