"use client";

type AutomationToken = {
  token: string;
  label: string;
  group: string;
};

type TokenSidebarProps = {
  tokens: AutomationToken[];
  onInsert: (token: string) => void;
  /** @deprecated "dark" maps to sem-ai; "light" retained for legacy sentence builder only */
  variant?: "light" | "dark" | "ai";
};

export const defaultAutomationTokens: AutomationToken[] = [
  { token: "{{client.first_name}}", label: "Client first name", group: "Client" },
  { token: "{{client.name}}", label: "Client full name", group: "Client" },
  { token: "{{company.name}}", label: "Company name", group: "Company" },
  { token: "{{company.phone}}", label: "Company phone", group: "Company" },
  { token: "{{company.google_review_url}}", label: "Google review URL", group: "Company" },
  { token: "{{job.scheduled_at}}", label: "Job scheduled time", group: "Job" },
  { token: "{{job.completed_at}}", label: "Job completed time", group: "Job" },
  { token: "{{invoice.number}}", label: "Invoice number", group: "Invoice" },
  { token: "{{invoice.balance_due}}", label: "Invoice balance due", group: "Invoice" },
  { token: "{{invoice.paid_at}}", label: "Invoice paid time", group: "Invoice" },
];

export function TokenSidebar({ tokens, onInsert, variant = "ai" }: TokenSidebarProps) {
  const groupedTokens = tokens.reduce<Record<string, AutomationToken[]>>((groups, token) => {
    groups[token.group] = [...(groups[token.group] ?? []), token];
    return groups;
  }, {});

  const isLegacyLight = variant === "light";

  return (
    <aside
      className={
        isLegacyLight
          ? "rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4"
          : "sem-ai-inspector-surface rounded-2xl p-4 shadow-2xl"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <p
          className={`text-[11px] uppercase tracking-[0.28em] ${
            isLegacyLight ? "text-[color:var(--sem-accent-primary)]" : "text-[color:var(--sem-ai-grid-text-accent)]"
          }`}
        >
          {"{...}"} Tokens
        </p>
        <span
          className={
            isLegacyLight
              ? "theme-badge rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em]"
              : "rounded-full border border-[color:var(--cmp-status-success-border)] bg-[color:var(--cmp-status-success-bg)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[color:var(--cmp-status-success-text)]"
          }
        >
          Safe
        </span>
      </div>
      <p
        className={`mt-2 text-xs leading-5 ${
          isLegacyLight ? "text-[color:var(--sem-text-secondary)]" : "text-[color:var(--sem-ai-grid-text-secondary)]"
        }`}
      >
        Insert approved placeholders. Customer sends are blocked if tokens remain unresolved.
      </p>

      <div className="mt-4 space-y-4">
        {Object.entries(groupedTokens).map(([group, groupTokens]) => (
          <div key={group}>
            <p
              className={`text-xs font-semibold ${
                isLegacyLight ? "text-[color:var(--sem-text-primary)]" : "text-[color:var(--sem-ai-grid-text-primary)]"
              }`}
            >
              {group}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {groupTokens.map((token) => (
                <button
                  key={token.token}
                  type="button"
                  onClick={() => onInsert(token.token)}
                  className={
                    isLegacyLight
                      ? "theme-control-surface-soft rounded-full border px-3 py-2 text-left text-xs transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]"
                      : "rounded-full border border-[color:var(--sem-ai-node-border)] bg-[color:color-mix(in_srgb,var(--sem-ai-node-bg)_72%,transparent)] px-3 py-2 text-left text-xs text-[color:var(--sem-ai-grid-text-secondary)] transition hover:border-[color:var(--sem-ai-connector-output)] hover:bg-[color:color-mix(in_srgb,var(--sem-ai-connector-output)_8%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--sem-ai-node-border-selected)_45%,transparent)]"
                  }
                  title={token.token}
                >
                  {token.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
