"use client";

type AutomationToken = {
  token: string;
  label: string;
  group: string;
};

type TokenSidebarProps = {
  tokens: AutomationToken[];
  onInsert: (token: string) => void;
  variant?: "light" | "dark";
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

export function TokenSidebar({ tokens, onInsert, variant = "light" }: TokenSidebarProps) {
  const groupedTokens = tokens.reduce<Record<string, AutomationToken[]>>((groups, token) => {
    groups[token.group] = [...(groups[token.group] ?? []), token];
    return groups;
  }, {});

  const isDark = variant === "dark";

  return (
    <aside
      className={
        isDark
          ? "rounded-2xl border border-white/10 bg-zinc-900/90 p-4 shadow-2xl"
          : "rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <p className={`text-[11px] uppercase tracking-[0.28em] ${isDark ? "text-cyan-300" : "text-[color:var(--sem-accent-primary)]"}`}>
          {"{...}"} Tokens
        </p>
        <span
          className={
            isDark
              ? "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-emerald-200"
              : "theme-badge rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em]"
          }
        >
          Safe
        </span>
      </div>
      <p className={`mt-2 text-xs leading-5 ${isDark ? "text-zinc-500" : "text-[color:var(--sem-text-secondary)]"}`}>
        Insert approved placeholders. Customer sends are blocked if tokens remain unresolved.
      </p>

      <div className="mt-4 space-y-4">
        {Object.entries(groupedTokens).map(([group, groupTokens]) => (
          <div key={group}>
            <p className={`text-xs font-semibold ${isDark ? "text-zinc-200" : "text-[color:var(--sem-text-primary)]"}`}>{group}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {groupTokens.map((token) => (
                <button
                  key={token.token}
                  type="button"
                  onClick={() => onInsert(token.token)}
                  className={
                    isDark
                      ? "rounded-full border border-white/10 bg-black/30 px-3 py-2 text-left text-xs text-zinc-300 transition hover:border-cyan-400/30 hover:bg-cyan-400/5"
                      : "theme-control-surface-soft rounded-full border px-3 py-2 text-left text-xs transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]"
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
