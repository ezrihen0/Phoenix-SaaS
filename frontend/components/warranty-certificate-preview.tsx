"use client";

import { useState } from "react";
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

import type { WarrantyDocumentViewModel } from "@/lib/crm/warranty-document.types";

function InfoField({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-900/10 bg-blue-950/[0.04] text-blue-950">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{label}</p>
          <p className="mt-2 text-lg font-semibold leading-6 tracking-tight text-slate-800">{value}</p>
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

function CompanyLogo({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return null;
  }
  return (
    // Organization logos are stored URLs, including same-origin upload paths.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${name} logo`}
      className="mb-4 h-16 w-16 rounded-full border border-slate-200 bg-white object-cover"
      onError={() => setFailed(true)}
    />
  );
}

export default function WarrantyCertificatePreview({ document }: { document: WarrantyDocumentViewModel }) {
  const t = useTranslations("warrantyCertificate");
  const contactLines = [
    document.companyAddress,
    document.companyPhone ? `${t("phone")}: ${document.companyPhone}` : null,
    document.companyEmail ? `${t("email")}: ${document.companyEmail}` : null,
    document.companyWebsite ? `${t("website")}: ${document.companyWebsite}` : null,
    document.companyLicense ? `License: ${document.companyLicense}` : null,
    document.companyTaxNumber ? `Tax/GST: ${document.companyTaxNumber}` : null,
  ].filter((line): line is string => Boolean(line));

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
            {document.frozen ? null : (
              <p className="mt-1 text-sm text-slate-500">This preview is the certificate Generate will issue.</p>
            )}
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

        <article className="relative overflow-hidden rounded-[42px] border border-slate-300 bg-[#fffaf0] p-5 shadow-[0_40px_120px_rgba(15,23,42,0.18)] [print-color-adjust:exact] md:p-8 print:rounded-none print:bg-[#fffaf0] print:p-6 print:shadow-none">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.08] print:hidden">
            <div className="absolute inset-0 bg-[linear-gradient(45deg,#0f172a_1px,transparent_1px),linear-gradient(-45deg,#0f172a_1px,transparent_1px)] bg-[size:24px_24px]" />
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border-[42px] border-blue-950/5 print:hidden" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -left-28 h-80 w-80 rounded-full border-[48px] border-amber-500/10 print:hidden" />

          <div className="relative rounded-[34px] border-[3px] border-double border-blue-950/35 bg-white/82 p-6 md:p-10 print:rounded-none print:bg-white print:p-8">
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
                  {document.companyLogoUrl ? (
                    <CompanyLogo src={document.companyLogoUrl} name={document.companyName} />
                  ) : null}
                  <p className="text-xs font-bold uppercase tracking-[0.42em] text-blue-900/70">{document.companyName}</p>
                  {document.companyNameIsFallback ? (
                    <p className="mt-2 text-xs font-bold uppercase tracking-[0.28em] text-amber-800">{t("organizationMissing")}</p>
                  ) : null}
                  <h2 className="mt-4 max-w-4xl text-3xl font-semibold uppercase leading-tight tracking-[0.12em] text-slate-950 md:text-4xl">
                    {t("certificateTitle")}
                  </h2>
                  <p className="mx-auto mt-4 max-w-3xl text-sm leading-7 text-slate-600">{t("certificateIntro")}</p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2">
                  <SecurityMark label={t("verifiedServiceRecord")} />
                  <SecurityMark label={t("invoiceLinked")} />
                  <SecurityMark label={document.coverageStatusLabel} />
                </div>
              </div>

              <div className="mt-10 grid gap-4 md:grid-cols-2">
                <InfoField icon={UserRound} label={t("propertyOwner")} value={document.customerName} />
                <InfoField icon={MapPin} label={t("serviceLocation")} value={document.propertyLabel} />
                <InfoField
                  icon={Flame}
                  label={t("coveredAsset")}
                  value={document.coveredAssetLabel ?? t("coveredWorkPending")}
                />
                <InfoField
                  icon={FileCheck2}
                  label={t("certificateReference")}
                  value={`${document.certificateNumber} · ${t("invoiceLabel")} #${document.invoiceNumber ?? "-"}`}
                />
              </div>

              <div className="mt-8 rounded-[32px] border border-blue-950/15 bg-slate-950 p-6 text-white shadow-[0_24px_70px_rgba(15,23,42,0.24)] [print-color-adjust:exact]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.32em] text-amber-200">{t("warrantyTimeline")}</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-tight">{document.termsSummaryLabel}</h3>
                  </div>
                  <CalendarDays className="h-10 w-10 text-amber-200" />
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-[28px] border border-amber-300/70 bg-amber-50 p-6 text-center [print-color-adjust:exact]">
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-700">{document.effectiveDateCaption}</p>
                    <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{document.effectiveDateLabel}</p>
                  </div>
                  <div className="rounded-[28px] border border-blue-200 bg-blue-50 p-6 text-center [print-color-adjust:exact]">
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-blue-800">
                      {document.expirationCaption ?? t("expirationDate")}
                    </p>
                    <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                      {document.expirationDateLabel ?? document.emptyTermLabel}
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
                  <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-700">{document.coverageText}</p>
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 [print-color-adjust:exact]">
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-800">{t("limitationsTitle")}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950/75">{document.exclusionsText}</p>
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
                      <dd className="mt-1 font-semibold text-slate-950">{document.certificateNumber}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t("linkedInvoice")}</dt>
                      <dd className="mt-1 font-semibold text-slate-950">{document.invoiceNumber ?? "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t("customerReference")}</dt>
                      <dd className="mt-1 leading-6">
                        {document.customerName}
                        {document.customerCompany ? ` · ${document.customerCompany}` : ""}
                        {document.customerPhone ? ` · ${document.customerPhone}` : ""}
                        {document.customerEmail ? ` · ${document.customerEmail}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t("propertyReference")}</dt>
                      <dd className="mt-1 leading-6">{document.propertyLabel}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t("issuedBy")}</dt>
                      <dd className="mt-1 font-semibold text-slate-950">{document.companyName}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t("issueDate")}</dt>
                      <dd className="mt-1 font-semibold text-slate-950">{document.effectiveDateLabel}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{document.coverageStatusLabel}</dt>
                      <dd className="mt-1 font-semibold text-slate-950">{document.termsSummaryLabel}</dd>
                    </div>
                  </dl>
                  {contactLines.length ? (
                    <div className="mt-5 border-t border-slate-200 pt-4 text-xs leading-6 text-slate-600">
                      {contactLines.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </div>
                  ) : null}
                </aside>
              </div>

              {document.termsMode === "uniform" && document.coverageTermLabel ? (
                <article className="mt-8 rounded-[28px] border border-emerald-200 bg-emerald-50/80 p-5 [print-color-adjust:exact]">
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-800">{t("warrantyTermSummary")}</p>
                  <p className="mt-2 text-lg font-semibold text-emerald-950">{document.coverageTermLabel}</p>
                  <p className="mt-2 text-sm leading-6 text-emerald-900/80">{document.termsSummaryLabel}</p>
                </article>
              ) : null}

              {document.lineItems.length > 0 ? (
                <article className="mt-8 overflow-hidden rounded-[28px] border border-slate-200 bg-white/80">
                  <div className="border-b border-slate-200 px-5 py-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">{t("perLineTermsTitle")}</p>
                    {document.termsMode === "mixed" ? (
                      <p className="mt-2 text-sm text-slate-600">{document.termsSummaryLabel}</p>
                    ) : null}
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
                        {document.lineItems.map((lineItem, index) => (
                          <tr key={`${index}-${lineItem.name}`} className="border-t border-slate-200 align-top text-slate-700">
                            <td className="px-5 py-4">
                              <p className="font-medium text-slate-950">{lineItem.name}</p>
                              {lineItem.description ? (
                                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{lineItem.description}</p>
                              ) : null}
                            </td>
                            <td className="px-5 py-4 text-slate-950">{lineItem.quantity}</td>
                            <td className="px-5 py-4 text-slate-950">{lineItem.termLabel ?? document.emptyTermLabel}</td>
                            <td className="px-5 py-4 font-medium text-slate-950">{lineItem.expiryLabel ?? document.emptyTermLabel}</td>
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
                  <p className="mt-3 text-xl font-semibold text-slate-950">{document.companyName}</p>
                  <div className="mt-6 h-px bg-slate-300" />
                  <p className="mt-2 text-xs text-slate-500">{t("authorizedRepresentative")}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-500">{t("serviceCompletion")}</p>
                  <p className="mt-3 text-xl font-semibold text-slate-950">{document.completionDateLabel}</p>
                  <div className="mt-6 h-px bg-slate-300" />
                  <p className="mt-2 text-xs text-slate-500">{t("signatureLine")}</p>
                </div>
              </div>

              <footer className="mt-10 flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <Stamp className="h-5 w-5 text-blue-950" />
                  <span>{t("certificateNo")} {document.certificateNumber}</span>
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
