import Link from "next/link";

export default function BookIndexPage() {
  return (
    <main className="min-h-screen bg-[color:var(--flat-canvas)] text-[color:var(--text-primary)]">
      <div className="mx-auto max-w-3xl px-6 py-12 lg:px-10">
        <section className="theme-surface-modal rounded-[36px] border border-[color:rgba(212,175,55,0.2)] bg-[linear-gradient(170deg,rgba(8,8,8,0.96),rgba(19,19,19,0.9))] p-7 shadow-[0_36px_120px_rgba(0,0,0,0.4)] sm:p-9">
          <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--flat-gold)]">Online Booking</p>
          <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--text-primary)] sm:text-5xl">
            Use your organization booking link.
          </h1>
          <p className="mt-4 text-sm leading-7 text-[color:var(--text-secondary)] sm:text-base">
            Public booking is tied to your workspace. Open the link your organization shared (it includes the
            organization identifier in the path), for example{" "}
            <code className="rounded bg-[color:rgba(255,255,255,0.06)] px-2 py-0.5 text-xs">/book/your-org-slug</code>
            . Submitting a request without that path is not supported.
          </p>
          <p className="mt-6 text-sm text-[color:var(--text-secondary)]">
            <Link href="/" className="text-[color:var(--flat-gold)] underline-offset-4 hover:underline">
              Back to home
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
