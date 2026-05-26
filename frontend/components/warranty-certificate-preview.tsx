"use client";

import { useTranslations } from "next-intl";
import {
  Award,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  FileCheck2,
  Flame,
  MapPin,
  ShieldCheck,
  Stamp,
  UserRound,
} from "lucide-react";

import InvoiceCompanyHeader, { hasInvoiceCompanyHeaderContent } from "@/components/invoice-company-header";

const SHOW_LEGACY_WARRANTY_CERTIFICATE = false;

type WarrantyCertificateCompanySettings = {
  businessName: string | null;
  displayInitials?: string | null;
  companyDescription: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  website: string | null;
  companyEmail: string | null;
  phone: string | null;
};

type WarrantyCertificateLineItem = {
  id: string;
  sku_snapshot: string;
  name_snapshot: string;
  description_snapshot: string | null;
  quantity: string;
  warranty_months_snapshot: number | null;
  sort_order: number;
};

type WarrantyCertificatePreviewProps = {
  certificateNumber: string;
  invoiceNumber: string;
  issuedAt: string | null;
  paidAt: string | null;
  warrantyEndDate?: string | null;
  customerName: string;
  customerCompanyName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerAddressLines: string[];
  jobTitle: string | null;
  companySettings: WarrantyCertificateCompanySettings;
  lineItems: WarrantyCertificateLineItem[];
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function cleanValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized?.length ? normalized : null;
}

function getOrganizationName(settings: WarrantyCertificateCompanySettings) {
  return cleanValue(settings.businessName);
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function formatWarrantyTerm(months: number | null) {
  if (typeof months !== "number" || months <= 0) {
    return null;
  }

  if (months % 12 === 0 && months >= 12) {
    const years = months / 12;
    return `${years} year${years === 1 ? "" : "s"}`;
  }

  return `${months} month${months === 1 ? "" : "s"}`;
}

function formatWarrantyExpiry(baseDate: string | null, months: number | null) {
  if (!baseDate || typeof months !== "number" || months <= 0) {
    return "-";
  }

  const parsed = new Date(baseDate);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  parsed.setMonth(parsed.getMonth() + months);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function getEffectiveDate(issuedAt: string | null, paidAt: string | null) {
  return paidAt ?? issuedAt;
}

function getRecordedWarrantyMonths(lineItems: WarrantyCertificateLineItem[]) {
  return lineItems
    .map((lineItem) => lineItem.warranty_months_snapshot)
    .filter((months): months is number => typeof months === "number" && months > 0);
}

function getUniformWarrantyMonths(lineItems: WarrantyCertificateLineItem[]) {
  const recorded = getRecordedWarrantyMonths(lineItems);
  if (!recorded.length) {
    return null;
  }

  const unique = new Set(recorded);
  return unique.size === 1 ? recorded[0]! : null;
}

function hasMixedWarrantyTerms(lineItems: WarrantyCertificateLineItem[]) {
  const recorded = getRecordedWarrantyMonths(lineItems);
  if (recorded.length <= 1) {
    return false;
  }

  return new Set(recorded).size > 1;
}

function getCoveredAssetSummary(jobTitle: string | null, lineItems: WarrantyCertificateLineItem[]) {
  const names = lineItems.map((lineItem) => lineItem.name_snapshot.trim()).filter(Boolean);
  if (names.length === 1) {
    return names[0]!;
  }

  if (names.length > 1) {
    return names.join(" · ");
  }

  return jobTitle?.trim() || null;
}

function buildCompanyAddressLines(settings: WarrantyCertificateCompanySettings) {
  return [settings.address, settings.city, settings.zip]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean);
}

function InfoField({
  icon: Icon,
  label,
  value,
  strong = false,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-900/10 bg-blue-950/[0.04] text-blue-950">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{label}</p>
          <p className={cx("mt-2 leading-6 text-slate-800", strong ? "text-lg font-semibold tracking-tight" : "text-sm")}>{value}</p>
        </div>
      </div>
    </div>
  );
}

function SecurityMark({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-600">
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
      {label}
    </div>
  );
}

function LegacyWarrantyCertificatePreview({
  certificateNumber,
  invoiceNumber,
  issuedAt,
  paidAt,
  customerName,
  customerCompanyName,
  customerEmail,
  customerPhone,
  customerAddressLines,
  jobTitle,
  companySettings,
  lineItems,
}: WarrantyCertificatePreviewProps) {
  const sortedLineItems = [...lineItems].sort((left, right) => left.sort_order - right.sort_order);
  const hasCompanyHeader = hasInvoiceCompanyHeaderContent(companySettings);
  const customerContactItems = [
    customerPhone?.trim() ? `Phone: ${customerPhone.trim()}` : null,
    customerEmail?.trim() ? `Email: ${customerEmail.trim()}` : null,
  ].filter(Boolean);

  return (
    <section className="rounded-[32px] border border-black/5 bg-white text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.08)] print:rounded-none print:border-0 print:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-6 py-5 print:px-0">
        <div>
          <p className="text-[11px] uppercase tracking-[0.32em] text-slate-500">Warranty Certificate</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{certificateNumber}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Internal preview generated from the paid invoice snapshot. Warranty terms are shown per line item exactly as stored on the invoice.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-emerald-700">
            Ready for print / PDF
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            aria-label="Print or save warranty certificate as PDF"
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
          >
            Print / Save as PDF
          </button>
        </div>
      </div>

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.05fr)_320px] print:px-0">
        <div className="space-y-6">
          {hasCompanyHeader ? (
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
              <InvoiceCompanyHeader settings={companySettings} />
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-[24px] border border-slate-200 p-5">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Certificate Holder</p>
              <p className="mt-3 text-lg font-semibold text-slate-950">{customerName}</p>
              {customerCompanyName ? <p className="mt-1 text-sm text-slate-600">{customerCompanyName}</p> : null}
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                {customerAddressLines.length > 0 ? customerAddressLines.map((line) => (
                  <p key={line}>{line}</p>
                )) : <p>No service address on file.</p>}
              </div>
              {customerContactItems.length ? (
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                  {customerContactItems.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              ) : null}
            </article>

            <article className="rounded-[24px] border border-slate-200 p-5">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Certificate Meta</p>
              <div className="mt-4 grid gap-3 text-sm text-slate-600">
                <div className="flex items-center justify-between gap-3">
                  <span>Certificate</span>
                  <span className="font-medium text-slate-950">{certificateNumber}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Invoice</span>
                  <span className="font-medium text-slate-950">{invoiceNumber}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Issued</span>
                  <span className="font-medium text-slate-950">{formatDate(issuedAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Paid</span>
                  <span className="font-medium text-slate-950">{formatDate(paidAt)}</span>
                </div>
              </div>
            </article>
          </div>

          <article className="rounded-[24px] border border-slate-200 p-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Covered Work</p>
            <p className="mt-3 text-sm leading-7 text-slate-700">
              This certificate reflects the paid invoice snapshot for {jobTitle || "the completed service"}. Warranty terms vary by line item and are shown exactly as stored on the invoice at the time of billing.
            </p>
          </article>

          <article className="overflow-hidden rounded-[24px] border border-slate-200">
            <div className="border-b border-slate-200 px-5 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Per-Line Warranty Terms</p>
            </div>
            {sortedLineItems.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="document-line-table min-w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      <th className="px-5 py-3 font-medium">Item</th>
                      <th className="px-5 py-3 font-medium">Qty</th>
                      <th className="px-5 py-3 font-medium">Warranty Term</th>
                      <th className="px-5 py-3 font-medium">Warranty Through</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLineItems.map((lineItem) => (
                      <tr key={lineItem.id} className="border-t border-slate-200 align-top text-slate-700">
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-950">{lineItem.name_snapshot}</p>
                          {lineItem.description_snapshot ? (
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{lineItem.description_snapshot}</p>
                          ) : null}
                        </td>
                        <td className="px-5 py-4 text-slate-950">{lineItem.quantity}</td>
                        <td className="px-5 py-4 text-slate-950">{formatWarrantyTerm(lineItem.warranty_months_snapshot) ?? "No recorded warranty term"}</td>
                        <td className="px-5 py-4 font-medium text-slate-950">{formatWarrantyExpiry(paidAt ?? issuedAt, lineItem.warranty_months_snapshot)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 py-8 text-sm text-slate-500">
                No persisted invoice snapshot line items are available for this certificate.
              </div>
            )}
          </article>
        </div>

        <aside className="space-y-4">
          <article className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5 text-sm text-slate-700">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Certificate Notes</p>
            <div className="mt-4 space-y-3 leading-6">
              <p>This preview is available only after the invoice is fully paid or the balance reaches zero.</p>
              <p>No live Pricebook lookup is used. Every displayed warranty term comes from the stored invoice snapshot.</p>
            </div>
          </article>
        </aside>
      </div>
    </section>
  );
}

export default function WarrantyCertificatePreview(props: WarrantyCertificatePreviewProps) {
  if (SHOW_LEGACY_WARRANTY_CERTIFICATE) {
    return <LegacyWarrantyCertificatePreview {...props} />;
  }

  return <PremiumWarrantyCertificatePreview {...props} />;
}

function PremiumWarrantyCertificatePreview({
  certificateNumber,
  invoiceNumber,
  issuedAt,
  paidAt,
  warrantyEndDate,
  customerName,
  customerCompanyName,
  customerEmail,
  customerPhone,
  customerAddressLines,
  jobTitle,
  companySettings,
  lineItems,
}: WarrantyCertificatePreviewProps) {
  const t = useTranslations("warrantyCertificate");
  const sortedLineItems = [...lineItems].sort((left, right) => left.sort_order - right.sort_order);
  const organizationName = getOrganizationName(companySettings);
  const effectiveDate = getEffectiveDate(issuedAt, paidAt);
  const uniformMonths = getUniformWarrantyMonths(sortedLineItems);
  const mixedTerms = hasMixedWarrantyTerms(sortedLineItems);
  const coveredAsset = getCoveredAssetSummary(jobTitle, sortedLineItems);
  const propertyReference = customerAddressLines.length > 0 ? customerAddressLines.join(", ") : t("noServiceAddress");
  const globalTermLabel = uniformMonths ? formatWarrantyTerm(uniformMonths) : null;
  const globalExpirationDisplay = warrantyEndDate
    ? formatDate(warrantyEndDate)
    : uniformMonths && effectiveDate
      ? formatWarrantyExpiry(effectiveDate, uniformMonths)
      : null;
  const resolvedGlobalExpiration = globalExpirationDisplay === "-" ? null : globalExpirationDisplay;
  const companyContactItems = [
    cleanValue(companySettings.phone) ? `${t("phone")}: ${cleanValue(companySettings.phone)}` : null,
    cleanValue(companySettings.companyEmail) ? `${t("email")}: ${cleanValue(companySettings.companyEmail)}` : null,
    cleanValue(companySettings.website) ? `${t("website")}: ${cleanValue(companySettings.website)}` : null,
  ].filter(Boolean);
  const companyAddressLines = buildCompanyAddressLines(companySettings);
  const scopeCopy = cleanValue(companySettings.companyDescription)
    ? companySettings.companyDescription!.trim()
    : t("scopeFallback", { jobTitle: jobTitle?.trim() || t("completedService") });

  return (
    <section className="text-slate-900 print:text-black">
      <div className="mb-6 flex flex-col gap-4 rounded-[30px] border border-slate-200 bg-white/80 p-4 shadow-[0_22px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl print:hidden lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)]">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-blue-800">{t("eyebrow")}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{t("officialDocument")}</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            aria-label={t("printCertificate")}
            className="flex items-center gap-2 rounded-2xl border border-blue-500/30 bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_50px_rgba(37,99,235,0.22)] transition hover:bg-blue-700"
          >
            {t("printCertificate")}
          </button>
        </div>
      </div>

      <div className="relative mx-auto max-w-[1060px]">
        <div aria-hidden="true" className="absolute -inset-4 rounded-[48px] bg-gradient-to-br from-blue-900/10 via-amber-400/10 to-slate-950/10 blur-2xl print:hidden" />

        <article className="relative overflow-hidden rounded-[42px] border border-slate-300 bg-[#fffaf0] p-5 shadow-[0_40px_120px_rgba(15,23,42,0.18)] md:p-8 print:rounded-none print:border print:border-slate-300 print:bg-white print:p-0 print:shadow-none">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.08] print:hidden">
            <div className="absolute inset-0 bg-[linear-gradient(45deg,#0f172a_1px,transparent_1px),linear-gradient(-45deg,#0f172a_1px,transparent_1px)] bg-[size:24px_24px]" />
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border-[42px] border-blue-950/5 print:hidden" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -left-28 h-80 w-80 rounded-full border-[48px] border-amber-500/10 print:hidden" />

          <div className="relative rounded-[34px] border-[3px] border-double border-blue-950/35 bg-white/82 p-6 md:p-10 print:rounded-none print:border-0 print:bg-white print:p-8">
            <div aria-hidden="true" className="absolute left-5 top-5 h-16 w-16 rounded-tl-[28px] border-l-4 border-t-4 border-amber-500/70" />
            <div aria-hidden="true" className="absolute right-5 top-5 h-16 w-16 rounded-tr-[28px] border-r-4 border-t-4 border-amber-500/70" />
            <div aria-hidden="true" className="absolute bottom-5 left-5 h-16 w-16 rounded-bl-[28px] border-b-4 border-l-4 border-amber-500/70" />
            <div aria-hidden="true" className="absolute bottom-5 right-5 h-16 w-16 rounded-br-[28px] border-b-4 border-r-4 border-amber-500/70" />

            <div className="relative z-10">
              <div className="flex flex-col items-center gap-6 text-center">
                <div className="relative">
                  <div aria-hidden="true" className="absolute -inset-3 rounded-full bg-amber-400/20 blur-xl print:hidden" />
                  <div className="relative flex h-36 w-36 items-center justify-center rounded-full border-[10px] border-amber-300 bg-gradient-to-br from-blue-950 via-blue-900 to-slate-950 text-white shadow-[0_28px_60px_rgba(15,23,42,0.26)]">
                    <div aria-hidden="true" className="absolute inset-3 rounded-full border border-amber-200/60" />
                    <div className="px-4 text-center">
                      <Award className="mx-auto h-9 w-9 text-amber-200" />
                      <p className="mt-3 text-[11px] font-bold uppercase leading-4 tracking-[0.18em] text-amber-100">
                        {t("warrantyCertificate")}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  {organizationName ? (
                    <p className="text-xs font-bold uppercase tracking-[0.42em] text-blue-900/70">{organizationName}</p>
                  ) : (
                    <p className="text-xs font-bold uppercase tracking-[0.42em] text-amber-800">{t("organizationMissing")}</p>
                  )}
                  <h2 className="mt-4 max-w-4xl text-3xl font-semibold uppercase leading-tight tracking-[0.12em] text-slate-950 md:text-4xl">
                    {t("certificateTitle")}
                  </h2>
                  <p className="mx-auto mt-4 max-w-3xl text-sm leading-7 text-slate-600">{t("certificateIntro")}</p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2">
                  <SecurityMark label={t("verifiedServiceRecord")} />
                  <SecurityMark label={t("invoiceLinked")} />
                  <SecurityMark label={t("snapshotTerms")} />
                </div>
              </div>

              <div className="mt-10 grid gap-4 md:grid-cols-2">
                <InfoField icon={UserRound} label={t("propertyOwner")} value={customerName} strong />
                <InfoField icon={MapPin} label={t("serviceLocation")} value={propertyReference} strong />
                <InfoField
                  icon={Flame}
                  label={t("coveredAsset")}
                  value={coveredAsset ?? t("coveredWorkPending")}
                  strong
                />
                <InfoField
                  icon={FileCheck2}
                  label={t("certificateReference")}
                  value={`${certificateNumber} · ${t("invoiceLabel")} #${invoiceNumber}`}
                  strong
                />
              </div>

              <div className="mt-8 rounded-[32px] border border-blue-950/15 bg-slate-950 p-6 text-white shadow-[0_24px_70px_rgba(15,23,42,0.24)] print:bg-white print:text-slate-950 print:shadow-none">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.32em] text-amber-200/80 print:text-amber-800">{t("warrantyTimeline")}</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                      {uniformMonths && globalTermLabel
                        ? t("globalProtectionWindow", { term: globalTermLabel })
                        : mixedTerms
                          ? t("perLineProtectionWindow")
                          : t("protectionWindowPending")}
                    </h3>
                  </div>
                  <CalendarDays className="h-10 w-10 text-amber-200 print:text-blue-950" />
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-[28px] border border-amber-300/70 bg-amber-50 p-6 text-center print:border-amber-300 print:bg-amber-50">
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-700">{t("effectiveDate")}</p>
                    <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{formatDate(effectiveDate)}</p>
                  </div>
                  <div className="rounded-[28px] border border-blue-200 bg-blue-50 p-6 text-center print:border-blue-200 print:bg-blue-50">
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-blue-800">{t("expirationDate")}</p>
                    <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                      {resolvedGlobalExpiration ?? (mixedTerms ? t("seePerLineTerms") : "-")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-[32px] border border-slate-200 bg-white/72 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-950 text-white">
                      <BadgeCheck className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-500">{t("certifiedScope")}</p>
                      <h3 className="mt-1 text-xl font-semibold text-slate-950">{t("technicalCompletion")}</h3>
                    </div>
                  </div>
                  <p className="mt-5 text-sm leading-7 text-slate-700">{scopeCopy}</p>
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-800">{t("limitationsTitle")}</p>
                    <p className="mt-2 text-sm leading-6 text-amber-950/75">{t("limitationsBody")}</p>
                  </div>
                </div>

                <aside className="rounded-[32px] border border-slate-200 bg-white/72 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-500">{t("referencePanelTitle")}</p>
                    <h3 className="mt-1 text-xl font-semibold text-slate-950">{t("referencePanelHeading")}</h3>
                  </div>
                  <dl className="mt-5 space-y-4 text-sm text-slate-700">
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t("certificateNumber")}</dt>
                      <dd className="mt-1 font-semibold text-slate-950">{certificateNumber}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t("linkedInvoice")}</dt>
                      <dd className="mt-1 font-semibold text-slate-950">{invoiceNumber}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t("customerReference")}</dt>
                      <dd className="mt-1 leading-6">
                        {customerName}
                        {customerCompanyName ? ` · ${customerCompanyName}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t("propertyReference")}</dt>
                      <dd className="mt-1 leading-6">{propertyReference}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t("issuedBy")}</dt>
                      <dd className="mt-1 font-semibold text-slate-950">{organizationName ?? t("organizationMissing")}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t("issueDate")}</dt>
                      <dd className="mt-1 font-semibold text-slate-950">{formatDate(effectiveDate)}</dd>
                    </div>
                    {globalTermLabel ? (
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t("warrantyWindow")}</dt>
                        <dd className="mt-1 font-semibold text-slate-950">
                          {globalTermLabel}
                          {resolvedGlobalExpiration ? ` · ${t("through")} ${resolvedGlobalExpiration}` : ""}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  {companyContactItems.length || companyAddressLines.length ? (
                    <div className="mt-5 border-t border-slate-200 pt-4 text-xs leading-6 text-slate-600">
                      {companyAddressLines.length ? <p>{companyAddressLines.join(", ")}</p> : null}
                      {companyContactItems.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </div>
                  ) : null}
                </aside>
              </div>

              {uniformMonths && globalTermLabel ? (
                <article className="mt-8 rounded-[28px] border border-emerald-200 bg-emerald-50/80 p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-800">{t("warrantyTermSummary")}</p>
                  <p className="mt-2 text-lg font-semibold text-emerald-950">{globalTermLabel}</p>
                  <p className="mt-2 text-sm leading-6 text-emerald-900/80">{t("uniformTermsHelper")}</p>
                </article>
              ) : mixedTerms ? (
                <article className="mt-8 overflow-hidden rounded-[28px] border border-slate-200 bg-white/80">
                  <div className="border-b border-slate-200 px-5 py-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">{t("perLineTermsTitle")}</p>
                    <p className="mt-2 text-sm text-slate-600">{t("perLineTermsHelper")}</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="document-line-table min-w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          <th className="px-5 py-3 font-medium">{t("item")}</th>
                          <th className="px-5 py-3 font-medium">{t("qty")}</th>
                          <th className="px-5 py-3 font-medium">{t("warrantyTerm")}</th>
                          <th className="px-5 py-3 font-medium">{t("warrantyThrough")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedLineItems.map((lineItem) => (
                          <tr key={lineItem.id} className="border-t border-slate-200 align-top text-slate-700">
                            <td className="px-5 py-4">
                              <p className="font-medium text-slate-950">{lineItem.name_snapshot}</p>
                              {lineItem.description_snapshot ? (
                                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{lineItem.description_snapshot}</p>
                              ) : null}
                            </td>
                            <td className="px-5 py-4 text-slate-950">{lineItem.quantity}</td>
                            <td className="px-5 py-4 text-slate-950">{formatWarrantyTerm(lineItem.warranty_months_snapshot) ?? t("noRecordedTerm")}</td>
                            <td className="px-5 py-4 font-medium text-slate-950">{formatWarrantyExpiry(effectiveDate, lineItem.warranty_months_snapshot)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ) : sortedLineItems.length > 0 ? (
                <article className="mt-8 overflow-hidden rounded-[28px] border border-slate-200 bg-white/80">
                  <div className="border-b border-slate-200 px-5 py-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">{t("perLineTermsTitle")}</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="document-line-table min-w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          <th className="px-5 py-3 font-medium">{t("item")}</th>
                          <th className="px-5 py-3 font-medium">{t("qty")}</th>
                          <th className="px-5 py-3 font-medium">{t("warrantyTerm")}</th>
                          <th className="px-5 py-3 font-medium">{t("warrantyThrough")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedLineItems.map((lineItem) => (
                          <tr key={lineItem.id} className="border-t border-slate-200 align-top text-slate-700">
                            <td className="px-5 py-4">
                              <p className="font-medium text-slate-950">{lineItem.name_snapshot}</p>
                            </td>
                            <td className="px-5 py-4 text-slate-950">{lineItem.quantity}</td>
                            <td className="px-5 py-4 text-slate-950">{formatWarrantyTerm(lineItem.warranty_months_snapshot) ?? t("noRecordedTerm")}</td>
                            <td className="px-5 py-4 font-medium text-slate-950">{formatWarrantyExpiry(effectiveDate, lineItem.warranty_months_snapshot)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ) : (
                <div className="mt-8 rounded-[28px] border border-dashed border-slate-300 px-5 py-8 text-sm text-slate-500">
                  {t("noLineItems")}
                </div>
              )}

              <div className="mt-10 grid gap-6 border-t border-slate-200 pt-8 md:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-500">{t("authorizedSignature")}</p>
                  <p className="mt-3 text-xl font-semibold text-slate-950">{organizationName ?? t("authorizedRepresentative")}</p>
                  <div className="mt-6 h-px bg-slate-300" />
                  <p className="mt-2 text-xs text-slate-500">{t("authorizedRepresentative")}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-500">{t("serviceCompletion")}</p>
                  <div className="mt-8 h-px bg-slate-300" />
                  <p className="mt-2 text-xs text-slate-500">{t("signatureLine")}</p>
                </div>
              </div>

              <footer className="mt-10 flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 text-sm text-slate-600 md:flex-row md:items-center md:justify-between print:border-slate-200">
                <div className="flex items-center gap-3">
                  <Stamp className="h-5 w-5 text-blue-950" />
                  <span>{t("certificateNo")} {certificateNumber}</span>
                </div>
                <p className="text-xs text-slate-500">{t("generatedByWizField")}</p>
              </footer>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
