/* eslint-disable @next/next/no-img-element */
import React from "react";

import styles from "./warranty-pdf.module.css";

type WarrantyPDFProps = {
  customerName: string;
  serviceType: string;
  durationMonths: number;
  expiryDate: string;
  serialNumber: string;
};

function formatDuration(durationMonths: number) {
  const roundedDuration = Number.isFinite(durationMonths) ? Math.max(0, Math.round(durationMonths)) : 0;

  return `${roundedDuration} MONTH${roundedDuration === 1 ? "" : "S"}`;
}

export default function WarrantyPDF({
  customerName = "John Doe",
  serviceType = "Gas Fireplace Installation",
  durationMonths = 24,
  expiryDate = "May 15, 2028",
  serialNumber = "PHX-99281-02",
}: WarrantyPDFProps) {
  return (
    <section className={`${styles.sheet} relative h-[794px] w-[1123px] overflow-hidden bg-white text-slate-900 shadow-[0_30px_90px_rgba(15,23,42,0.18)] print:shadow-none`}>
      <div className="pointer-events-none absolute inset-0 border border-slate-300" />
      <div className="pointer-events-none absolute inset-[14px] border border-slate-200" />
      <div className="absolute inset-y-[22px] left-[22px] w-[10px] bg-[#EA580C]" />

      <div className="relative flex h-full flex-col px-[58px] py-[42px]">
        <header className="grid grid-cols-[1.55fr_0.95fr] overflow-hidden rounded-[28px] border border-slate-200">
          <div className="relative bg-slate-950 px-10 py-9 text-white">
            <div className="absolute inset-y-0 right-0 w-px bg-white/10" />
            <div className="flex items-start justify-between gap-8">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-4 rounded-full border border-white/15 bg-white/[0.06] px-5 py-3">
                  <img
                    src="/phoenix-logo.png"
                    alt="Phoenix Chimney & Fireplace logo"
                    className="h-10 w-auto object-contain"
                  />
                  <div className="min-w-0 border-l border-white/15 pl-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-slate-300">
                      Phoenix Chimney & Fireplace
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Residential Fireplace & Chimney Service
                    </p>
                  </div>
                </div>

                <div className="mt-10">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.38em] text-slate-400">
                    Official Warranty Record
                  </p>
                  <h1 className="mt-5 max-w-[500px] text-[54px] font-semibold leading-[0.94] tracking-[-0.04em] text-white">
                    Warranty Certificate
                  </h1>
                  <p className="mt-5 max-w-[520px] text-[15px] leading-7 text-slate-300">
                    This certificate confirms the warranty coverage issued for the completed home service listed
                    below. Coverage applies according to Phoenix Chimney & Fireplace service standards.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative flex flex-col justify-between bg-slate-900 px-10 py-9 text-white">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.36em] text-slate-400">
                Warranty Duration
              </p>
              <div className="mt-5 rounded-[28px] border border-[#EA580C]/40 bg-white px-6 py-6 text-slate-950 shadow-[0_20px_50px_rgba(15,23,42,0.18)]">
                <p className="text-[56px] font-semibold leading-none tracking-[-0.05em] text-slate-950">
                  {durationMonths}
                </p>
                <p className="mt-3 text-[13px] font-semibold uppercase tracking-[0.34em] text-[#EA580C]">
                  {formatDuration(durationMonths)}
                </p>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/[0.06] px-6 py-5">
              <p className="text-[10px] uppercase tracking-[0.34em] text-slate-400">Coverage Territory</p>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                Valid for documented service work performed by Phoenix Chimney & Fireplace in Canada and the United
                States.
              </p>
            </div>
          </div>
        </header>

        <div className="mt-8 grid flex-1 grid-cols-[1.15fr_0.85fr] gap-8">
          <div className="grid content-start gap-6">
            <section className="grid grid-cols-2 gap-5">
              <article className="rounded-[24px] border border-slate-200 bg-white px-6 py-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-slate-400">
                  Certificate Holder
                </p>
                <p className="mt-4 border-b border-slate-200 pb-3 text-[30px] font-semibold leading-tight tracking-[-0.03em] text-slate-950">
                  {customerName}
                </p>
              </article>

              <article className="rounded-[24px] border border-slate-200 bg-white px-6 py-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-slate-400">
                  Service Type
                </p>
                <p className="mt-4 border-b border-slate-200 pb-3 text-[30px] font-semibold leading-tight tracking-[-0.03em] text-slate-950">
                  {serviceType}
                </p>
              </article>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-slate-50 px-7 py-6">
              <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-slate-400">
                    Expiry Date
                  </p>
                  <p className="mt-3 text-[23px] font-semibold tracking-[-0.03em] text-slate-950">{expiryDate}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-slate-400">
                    Serial Number
                  </p>
                  <p className="mt-3 font-mono text-[20px] tracking-[0.08em] text-slate-700">{serialNumber}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-slate-400">
                    Coverage Term
                  </p>
                  <p className="mt-3 text-[23px] font-semibold tracking-[-0.03em] text-slate-950">
                    {formatDuration(durationMonths)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-slate-400">
                    Status
                  </p>
                  <div className="mt-3 inline-flex items-center rounded-full border border-[#EA580C]/20 bg-[#EA580C]/[0.08] px-4 py-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#EA580C]" />
                    <span className="ml-3 text-xs font-semibold uppercase tracking-[0.26em] text-slate-950">
                      Active Coverage
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white px-7 py-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-slate-400">Coverage Note</p>
              <p className="mt-4 text-[15px] leading-7 text-slate-600">
                This certificate is issued as a premium customer record and should be retained with the original
                service documentation. Warranty duration begins on the documented completion date for the covered
                service.
              </p>
            </section>
          </div>

          <div className="grid content-start gap-6">
            <section className="rounded-[28px] border border-slate-200 bg-white px-7 py-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-slate-400">
                Certificate Validation
              </p>
              <div className="mt-5 grid gap-4">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-5 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-400">
                    Authorized By
                  </p>
                  <p className="mt-2 text-lg font-semibold tracking-[-0.02em] text-slate-950">
                    Phoenix Chimney & Fireplace
                  </p>
                </div>

                <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-5 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-400">
                    Document Reference
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Use the serial number and QR placeholder below to reconcile this certificate against internal
                    service records.
                  </p>
                </div>
              </div>
            </section>

            <div className="mt-auto grid grid-cols-[1fr_168px] gap-5">
              <section className="rounded-[28px] border border-slate-200 bg-white px-7 py-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-slate-400">Verification</p>
                <div className="mt-5 flex items-end justify-between gap-6">
                  <div className="min-w-0 flex-1">
                    <div className="h-px w-full bg-slate-300" />
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                      Authorized Signature
                    </p>
                  </div>
                  <div className="flex h-[118px] w-[118px] items-center justify-center rounded-[18px] border border-dashed border-slate-300 bg-slate-50 text-center">
                    <div>
                      <div className="mx-auto grid h-[58px] w-[58px] grid-cols-4 gap-1">
                        {Array.from({ length: 16 }).map((_, index) => (
                          <span
                            key={index}
                            className={`block rounded-[2px] ${
                              [0, 1, 3, 4, 6, 7, 8, 10, 13, 14, 15].includes(index) ? "bg-slate-900" : "bg-slate-200"
                            }`}
                          />
                        ))}
                      </div>
                      <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                        QR Code
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="flex items-end justify-end">
                <div className="relative flex h-[168px] w-[168px] items-center justify-center rounded-full border-[3px] border-[#C8922C] bg-[radial-gradient(circle_at_30%_30%,#f8e8a6_0%,#efcf6a_38%,#d5a63c_72%,#bb8420_100%)] shadow-[0_20px_45px_rgba(194,146,44,0.28)]">
                  <div className="absolute inset-[12px] rounded-full border border-white/60" />
                  <div className="absolute inset-[22px] rounded-full border border-[#8b5f10]/[0.45]" />
                  <div className="text-center text-[#6B4211]">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.36em]">Authorized</p>
                    <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.04em]">Seal</p>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.28em]">Premium Service</p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>

        <footer className="mt-7 flex items-end justify-between gap-8 border-t border-slate-200 pt-5">
          <div className="max-w-[640px]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-slate-400">Statement</p>
            <p className="mt-3 text-[13px] leading-6 text-slate-500">
              This document is intended for customer records and print-to-PDF delivery. Coverage remains subject to
              the stated warranty term, service scope, and the original Phoenix Chimney & Fireplace documentation.
            </p>
          </div>

          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-slate-400">Head Office</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Phoenix Chimney & Fireplace
              <br />
              Canada & USA Service Operations
            </p>
          </div>
        </footer>
      </div>
    </section>
  );
}
