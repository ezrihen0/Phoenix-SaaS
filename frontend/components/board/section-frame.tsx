import type { ReactNode } from "react";

type SectionFrameProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function SectionFrame({ title, subtitle, children }: SectionFrameProps) {
  return (
    <section className="theme-surface-card rounded-[30px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_0_0_1px_color-mix(in_srgb,var(--sem-accent-primary)_6%,transparent),0_24px_60px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)] backdrop-blur-lg sm:p-6">
      <p className="text-[11px] uppercase tracking-[0.38em] text-[color:var(--sem-accent-primary)]">{subtitle}</p>
      <h2 className="mt-3 font-[family:var(--font-flat-display)] text-3xl tracking-tight text-[color:var(--sem-display-headline)]">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}
