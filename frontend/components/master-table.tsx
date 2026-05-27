import Link from "next/link";
import { useTranslations } from "next-intl";
import type { HTMLAttributes, ReactNode } from "react";

// Step 7 baseline reference component: extend by role-based token migration, do not rewrite.

type MasterTableColumn = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
};

type MasterTableProps = {
  columns: MasterTableColumn[];
  children: ReactNode;
  colSpan?: number;
  state?: MasterTableState;
};

export type MasterTableState = {
  status: "ready" | "loading" | "empty" | "error";
  message?: ReactNode;
  skeletonRows?: number;
};

function alignClass(align: MasterTableColumn["align"]) {
  if (align === "right") {
    return "text-right";
  }

  if (align === "center") {
    return "text-center";
  }

  return "text-left";
}

export function MasterTable({ columns, children, colSpan, state }: MasterTableProps) {
  const resolvedColSpan = colSpan ?? columns.length;
  const status = state?.status ?? "ready";

  const tableBodyContent = (() => {
    if (status === "loading") {
      const placeholderCount = Math.max(1, state?.skeletonRows ?? 6);
      return Array.from({ length: placeholderCount }, (_, index) => (
        <tr key={`skeleton-${index}`} className="master-table-row master-table-row-skeleton" aria-hidden="true">
          <td className="master-table-cell" colSpan={resolvedColSpan}>
            <div className="master-table-skeleton-line" />
          </td>
        </tr>
      ));
    }

    if (status === "empty" || status === "error") {
      return (
        <tr>
          <td className="master-table-empty" colSpan={resolvedColSpan}>
            {state?.message}
          </td>
        </tr>
      );
    }

    return children;
  })();

  return (
    <div className="master-table-wrap">
      <table className="master-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={`master-table-header-cell ${alignClass(column.align)}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{tableBodyContent}</tbody>
      </table>
    </div>
  );
}

type MasterTableRowProps = HTMLAttributes<HTMLTableRowElement> & {
  interactive?: boolean;
  selected?: boolean;
};

export function MasterTableRow({
  interactive = false,
  selected = false,
  className,
  ...props
}: MasterTableRowProps) {
  const classes = [
    "master-table-row",
    interactive ? "master-table-row-interactive" : "",
    selected ? "master-table-row-selected" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return <tr {...props} className={classes} />;
}

type MasterRowLinkProps = {
  href: string;
  children: ReactNode;
};

export function MasterRowLink({ href, children }: MasterRowLinkProps) {
  return (
    <Link href={href} className="master-table-row-link">
      {children}
    </Link>
  );
}

type MasterTablePaginationProps = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  previousHref: string;
  nextHref: string;
};

export function MasterTablePagination({
  page,
  pageSize,
  totalCount,
  totalPages,
  previousHref,
  nextHref,
}: MasterTablePaginationProps) {
  const t = useTranslations();
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <div className="master-table-pagination">
      <p className="master-table-pagination-summary text-sm text-[color:var(--text-muted)]">
        {t("common.pagination.showing", { start, end, totalCount })}
      </p>
      <div className="master-table-pagination-controls">
        <Link
          href={page > 1 ? previousHref : "#"}
          aria-disabled={page <= 1}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
            page <= 1
              ? "pointer-events-none border-[color:var(--border-subtle)] text-[color:var(--text-muted)]"
              : "border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
          }`}
        >
          {t("common.actions.prev")}
        </Link>
        <span className="master-table-pagination-page text-sm text-[color:var(--text-secondary)]">
          {t("common.pagination.pageOf", { page, totalPages })}
        </span>
        <Link
          href={page < totalPages ? nextHref : "#"}
          aria-disabled={page >= totalPages}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
            page >= totalPages
              ? "pointer-events-none border-[color:var(--border-subtle)] text-[color:var(--text-muted)]"
              : "border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
          }`}
        >
          {t("common.actions.next")}
        </Link>
      </div>
    </div>
  );
}

type MasterMobileListProps<TItem> = {
  items: TItem[];
  emptyState: ReactNode;
  renderItem: (item: TItem) => ReactNode;
};

export function MasterMobileList<TItem>({ items, emptyState, renderItem }: MasterMobileListProps<TItem>) {
  return (
    <div className="master-mobile-list">
      {items.length ? (
        items.map((item) => renderItem(item))
      ) : (
        <div className="master-mobile-empty">{emptyState}</div>
      )}
    </div>
  );
}
