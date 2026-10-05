import assert from "node:assert/strict";

import { PdfRenderService } from "../documents/pdf/pdf-render.service";
import {
  buildCertificateNumber,
  buildViewModelFromSnapshot,
  DEFAULT_WARRANTY_COVERAGE_TEXT,
  DEFAULT_WARRANTY_EXCLUSIONS_TEXT,
  FALLBACK_COMPANY_NAME,
  formatWarrantyDateLabel,
  formatWarrantyTermLabel,
  planWarrantyIssue,
  warrantyPdfRendererForSnapshot,
  type WarrantyIssueInput,
  type WarrantyStoredSnapshot,
} from "./warranty-document-view-model";
import { WarrantyPdfService } from "./warranty-pdf.service";

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

const start = new Date(Date.UTC(2024, 0, 15, 12, 0, 0));
const now = new Date(Date.UTC(2024, 5, 1, 12, 0, 0));

function issueInput(overrides: Partial<WarrantyIssueInput> = {}): WarrantyIssueInput {
  return {
    invoiceId: "abcdef12-3456-7890-abcd-ef1234567890",
    invoiceNumber: "INV-100",
    jobTitle: "Fireplace service",
    warrantyType: null,
    coverageText: null,
    exclusionsText: null,
    startDate: start,
    completionDate: start,
    customerName: "Ada Owner",
    customerCompany: null,
    customerEmail: "ada@example.com",
    customerPhone: "403-555-0100",
    customerAddressLines: ["10 Main St", "Calgary, AB", "T2P 1A1"],
    companyName: "Phoenix Chimney & Fireplace",
    companyLogoUrl: null,
    companyPhone: "403-555-0199",
    companyEmail: "office@example.com",
    companyWebsite: "https://example.com",
    companyAddress: "100 Shop St, Calgary, T2P",
    companyLicense: "LIC-1",
    companyTaxNumber: "GST-1",
    accentColor: "#112233",
    warrantyMessage: "Custom coverage sentence.",
    now,
    lineItems: [
      {
        name: "Gas insert",
        description: "Installed insert",
        quantity: "1",
        warrantyMonths: 12,
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}

expect("null warranty months stay null and do not become 1 month", () => {
  const planned = planWarrantyIssue(issueInput({
    warrantyMessage: null,
    lineItems: [
      { name: "Inspection", description: null, quantity: "1", warrantyMonths: null, sortOrder: 0 },
      { name: "Travel", description: null, quantity: "1", warrantyMonths: 0, sortOrder: 1 },
    ],
  }));
  assert.equal(planned.viewModel.termsMode, "none");
  assert.equal(planned.viewModel.expirationDateLabel, null);
  assert.equal(planned.viewModel.coverageTermLabel, null);
  assert.equal(planned.viewModel.lineItems[0]?.warrantyMonths, null);
  assert.equal(planned.viewModel.lineItems[1]?.warrantyMonths, null);
  assert.equal(planned.viewModel.lineItems[0]?.termLabel, null);
  assert.equal(planned.columnEndDate.getTime(), planned.startDate.getTime());
  assert.equal(planned.snapshot.hasRecordedWarrantyTerm, false);
  assert.equal(planned.snapshot.documentVersion, 2);
  assert.equal(JSON.stringify(planned.snapshot).includes("1 month"), false);
});

expect("12 month term renders as 1 year", () => {
  assert.equal(formatWarrantyTermLabel(12), "1 year");
  assert.equal(formatWarrantyTermLabel(24), "2 years");
  assert.equal(formatWarrantyTermLabel(1), "1 month");
  assert.equal(formatWarrantyTermLabel(6), "6 months");
  const planned = planWarrantyIssue(issueInput());
  assert.equal(planned.viewModel.coverageTermLabel, "1 year");
  assert.equal(planned.viewModel.lineItems[0]?.termLabel, "1 year");
  assert.equal(planned.viewModel.lineItems[0]?.expiryLabel, formatWarrantyDateLabel(new Date(Date.UTC(2025, 0, 15, 12, 0, 0))));
  assert.equal(planned.viewModel.expirationDateLabel, "Jan 15, 2025");
  assert.equal(planned.viewModel.effectiveDateLabel, "Jan 15, 2024");
});

expect("mixed warranty durations stay distinct", () => {
  const planned = planWarrantyIssue(issueInput({
    lineItems: [
      { name: "Insert", description: null, quantity: "1", warrantyMonths: 12, sortOrder: 1 },
      { name: "Cap", description: null, quantity: "2", warrantyMonths: 6, sortOrder: 0 },
      { name: "Visit", description: null, quantity: "1", warrantyMonths: null, sortOrder: 2 },
    ],
  }));
  assert.equal(planned.viewModel.termsMode, "mixed");
  assert.equal(planned.viewModel.lineItems[0]?.name, "Cap");
  assert.equal(planned.viewModel.lineItems[0]?.termLabel, "6 months");
  assert.equal(planned.viewModel.lineItems[1]?.termLabel, "1 year");
  assert.equal(planned.viewModel.lineItems[2]?.warrantyMonths, null);
  assert.equal(planned.viewModel.lineItems[2]?.termLabel, null);
  assert.equal(planned.viewModel.expirationIsLatest, true);
  assert.equal(planned.viewModel.expirationDateLabel, "Jan 15, 2025");
  assert.notEqual(planned.viewModel.lineItems[0]?.expiryLabel, planned.viewModel.lineItems[1]?.expiryLabel);
});

expect("certificate number is the invoice prefix for preview and issue", () => {
  const preview = planWarrantyIssue(issueInput({ frozen: false }));
  const issued = planWarrantyIssue(issueInput({ frozen: true }));
  assert.equal(preview.viewModel.certificateNumber, "WAR-ABCDEF12");
  assert.equal(issued.viewModel.certificateNumber, preview.viewModel.certificateNumber);
  assert.equal(buildCertificateNumber(issueInput().invoiceId), "WAR-ABCDEF12");
  assert.equal(preview.viewModel.coverageText, issued.viewModel.coverageText);
  assert.equal(preview.viewModel.exclusionsText, issued.viewModel.exclusionsText);
  assert.equal(preview.viewModel.effectiveDateLabel, issued.viewModel.effectiveDateLabel);
  assert.equal(preview.viewModel.expirationDateLabel, issued.viewModel.expirationDateLabel);
  assert.equal(preview.viewModel.frozen, false);
  assert.equal(issued.viewModel.frozen, true);
});

expect("missing branding stays empty except the company name fallback", () => {
  const planned = planWarrantyIssue(issueInput({
    companyName: "  ",
    companyPhone: null,
    companyEmail: "",
    companyLogoUrl: null,
    companyWebsite: null,
    companyAddress: null,
    companyLicense: null,
    companyTaxNumber: null,
    warrantyMessage: null,
    coverageText: null,
  }));
  assert.equal(planned.viewModel.companyName, FALLBACK_COMPANY_NAME);
  assert.equal(planned.viewModel.companyNameIsFallback, true);
  assert.equal(planned.viewModel.companyPhone, null);
  assert.equal(planned.viewModel.companyEmail, null);
  assert.equal(planned.viewModel.companyLogoUrl, null);
  assert.equal(planned.viewModel.coverageText, DEFAULT_WARRANTY_COVERAGE_TEXT);
  assert.equal(planned.viewModel.exclusionsText, DEFAULT_WARRANTY_EXCLUSIONS_TEXT);
});

expect("frozen snapshot keeps stored null terms and certificate number", () => {
  const planned = planWarrantyIssue(issueInput({
    lineItems: [
      { name: "Insert", description: "Sealed", quantity: "1", warrantyMonths: null, sortOrder: 0 },
    ],
  }));
  const reloaded = buildViewModelFromSnapshot(planned.snapshot, { now });
  assert.ok(reloaded);
  assert.equal(reloaded?.documentVersion, 2);
  assert.equal(reloaded?.frozen, true);
  assert.equal(reloaded?.certificateNumber, planned.viewModel.certificateNumber);
  assert.equal(reloaded?.lineItems[0]?.warrantyMonths, null);
  assert.equal(reloaded?.coverageText, planned.viewModel.coverageText);
  assert.equal(reloaded?.exclusionsText, planned.viewModel.exclusionsText);
  assert.equal(reloaded?.companyName, planned.viewModel.companyName);
  assert.equal(warrantyPdfRendererForSnapshot(planned.snapshot), "document-v2");
});

expect("legacy snapshot stays on the legacy renderer and is not rewritten", () => {
  const legacy: WarrantyStoredSnapshot = {
    certificateNumber: "WAR-LEGACY01",
    companyName: "Old Co",
    companyLogoUrl: null,
    companyPhone: null,
    companyEmail: null,
    companyWebsite: null,
    companyAddress: null,
    companyLicense: null,
    companyTaxNumber: null,
    accentColor: null,
    customerName: "Legacy Customer",
    customerCompany: null,
    customerEmail: null,
    customerPhone: null,
    customerAddressLines: ["1 Old St"],
    invoiceNumber: "INV-OLD",
    completionDateLabel: "Jan 2, 2020",
    warrantyStartDateLabel: "Jan 2, 2020",
    warrantyEndDateLabel: "Jan 2, 2021",
    warrantyType: "installation",
    coverageText: "Legacy coverage",
    exclusionsText: "Legacy exclusions",
    lineItems: [{ name: "Old part", quantity: "1", warrantyMonths: 12 }],
  };
  const view = buildViewModelFromSnapshot(legacy, {
    now: new Date(Date.UTC(2024, 0, 1)),
    warrantyEnd: new Date(Date.UTC(2021, 0, 2)),
  });
  assert.equal(legacy.documentVersion, undefined);
  assert.equal(warrantyPdfRendererForSnapshot(legacy), "legacy");
  assert.equal(view?.documentVersion, 1);
  assert.equal(view?.certificateNumber, "WAR-LEGACY01");
  assert.equal(view?.lineItems[0]?.warrantyMonths, 12);
  assert.equal(view?.effectiveDateLabel, "Jan 2, 2020");
  assert.equal(view?.coverageText, "Legacy coverage");
  assert.equal(view?.coverageStatus, "expired");
});

expect("pdf includes every covered item and long copy across pages", () => {
  const names = Array.from({ length: 30 }, (_value, index) => `Covered item ${index + 1}`);
  const planned = planWarrantyIssue(issueInput({
    coverageText: `COVERAGE-START ${"coverage ".repeat(400)} COVERAGE-END`,
    exclusionsText: `EXCLUSION-START ${"exclusion ".repeat(400)} EXCLUSION-END`,
    lineItems: names.map((name, index) => ({
      name,
      description: null,
      quantity: "1",
      warrantyMonths: index % 2 === 0 ? 12 : null,
      sortOrder: index,
    })),
  }));
  const service = new WarrantyPdfService(new PdfRenderService());
  const pages = service.buildPageStreams(planned.viewModel);
  const joined = pages.join("\n");
  assert.ok(pages.length >= 2);
  for (const name of names) {
    assert.ok(joined.includes(name), name);
  }
  assert.ok(joined.includes("COVERAGE-START"));
  assert.ok(joined.includes("COVERAGE-END"));
  assert.ok(joined.includes("EXCLUSION-START"));
  assert.ok(joined.includes("EXCLUSION-END"));
  assert.equal(joined.includes("1 month"), false);
  const pdf = service.renderDocument(planned.viewModel);
  assert.equal(pdf.subarray(0, 5).toString("utf8"), "%PDF-");
  assert.ok(pdf.includes(Buffer.from("WAR-ABCDEF12")));
  assert.ok(pdf.includes(Buffer.from("%%EOF")));
});

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("warranty-document-view-model-unit-check complete");
