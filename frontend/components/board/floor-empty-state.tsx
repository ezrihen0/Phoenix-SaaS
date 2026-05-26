import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type FloorEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
};

export function FloorEmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
}: FloorEmptyStateProps) {
  return (
    <div className="theme-control-surface-soft rounded-[24px] border border-dashed border-[color:var(--cmp-border-subtle)] px-6 py-10 text-center">
      <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl theme-control-surface-soft text-[color:var(--sem-accent-primary)]">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-4 text-lg font-semibold text-[color:var(--sem-text-primary)]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-[color:var(--sem-text-secondary)]">{description}</p>
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="theme-btn-primary mt-6 inline-flex rounded-full px-5 py-2.5 text-sm font-medium"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
