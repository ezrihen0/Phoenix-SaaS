"use client";

type AutomationToken = {
  token: string;
  label: string;
  group: string;
};

type TokenSidebarProps = {
  tokens: AutomationToken[];
  onInsert: (token: string) => void;
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

export function TokenSidebar({ tokens, onInsert }: TokenSidebarProps) {
  const groupedTokens = tokens.reduce<Record<string, AutomationToken[]>>((groups, token) => {
    groups[token.group] = [...(groups[token.group] ?? []), token];
    return groups;
  }, {});

  return (
    <aside className="rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">{"{...}"} Tokens</p>
        <span className="theme-badge rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
          Safe
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[color:var(--sem-text-secondary)]">
        Insert approved placeholders. Customer sends are blocked if tokens remain unresolved.
      </p>

      <div className="mt-4 space-y-4">
        {Object.entries(groupedTokens).map(([group, groupTokens]) => (
          <div key={group}>
            <p className="text-xs font-semibold text-[color:var(--sem-text-primary)]">{group}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {groupTokens.map((token) => (
                <button
                  key={token.token}
                  type="button"
                  onClick={() => onInsert(token.token)}
                  className="theme-control-surface-soft rounded-full border px-3 py-2 text-left text-xs transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]"
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
