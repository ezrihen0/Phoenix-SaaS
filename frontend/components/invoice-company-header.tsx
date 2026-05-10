"use client";

type InvoiceCompanySettings = {
  businessName: string | null;
  displayInitials?: string | null;
  companyDescription: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  website: string | null;
  companyEmail: string | null;
  phone: string | null;
  companyName?: string | null;
  publicPhone?: string | null;
  publicEmail?: string | null;
};

function cleanValue(value: string | null | undefined) {
  const normalizedValue = value?.trim();
  return normalizedValue?.length ? normalizedValue : null;
}

function buildInitials(value: string) {
  const words = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (!words.length) {
    return null;
  }

  return words.map((word) => word[0]?.toUpperCase() ?? "").join("") || null;
}

export function hasInvoiceCompanyHeaderContent(settings: InvoiceCompanySettings) {
  const businessName = cleanValue(settings.businessName ?? settings.companyName ?? null);
  const displayInitials = cleanValue(settings.displayInitials);
  const logoInitials = displayInitials ?? (businessName ? buildInitials(businessName) : null);
  const phone = cleanValue(settings.phone ?? settings.publicPhone ?? null);
  const email = cleanValue(settings.companyEmail ?? settings.publicEmail ?? null);
  const website = cleanValue(settings.website);
  const description = cleanValue(settings.companyDescription);
  const addressParts = [settings.address, settings.city, settings.zip]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean);

  return Boolean(businessName || logoInitials || description || phone || email || website || addressParts.length);
}

export default function InvoiceCompanyHeader({ settings }: { settings: InvoiceCompanySettings }) {
  const businessName = cleanValue(settings.businessName ?? settings.companyName ?? null);
  const displayInitials = cleanValue(settings.displayInitials);
  const logoInitials = displayInitials ?? (businessName ? buildInitials(businessName) : null);
  const phone = settings.phone ?? settings.publicPhone ?? null;
  const email = settings.companyEmail ?? settings.publicEmail ?? null;
  const contactItems = [
    cleanValue(phone) ? `Phone: ${cleanValue(phone)}` : null,
    cleanValue(email) ? `Email: ${cleanValue(email)}` : null,
    cleanValue(settings.website) ? `Website: ${cleanValue(settings.website)}` : null,
  ].filter(Boolean);
  const addressParts = [settings.address, settings.city, settings.zip]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean);
  const addressLabel = addressParts.length ? addressParts.join(", ") : null;
  const description = cleanValue(settings.companyDescription);

  if (!hasInvoiceCompanyHeaderContent(settings)) {
    return null;
  }

  return (
    <section className="theme-surface-card rounded-[22px] p-4 text-sm text-[color:var(--text-secondary)]">
      <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Company Header</p>
      <div className="mt-2 flex items-center gap-3">
        {logoInitials ? (
          <span className="theme-badge inline-flex h-10 w-10 items-center justify-center rounded-full border text-xs font-semibold uppercase tracking-[0.2em]">
            {logoInitials}
          </span>
        ) : null}
        {businessName ? <p className="text-lg font-semibold text-[color:var(--text-primary)]">{businessName}</p> : null}
      </div>

      {description ? (
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">{description}</p>
      ) : null}

      {contactItems.length ? (
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[color:var(--text-secondary)]">
          {contactItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : null}

      {addressLabel ? <p className="mt-2 text-xs text-[color:var(--text-secondary)]">Address: {addressLabel}</p> : null}
    </section>
  );
}