import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { InvoiceEntity } from "../database/entities/invoice.entity";
import { DocumentBrandingSnapshotService } from "../documents/pdf/document-branding-snapshot.service";
import { executeCustomerSend } from "./customer-send-sequence";
import { readSnapshottedBranchTaxLabel, resolveCustomerDocumentTaxLabel } from "./document-tax-label";
import { cashCollectedCentsFromPayments, isCollectibleOpenInvoice } from "./finance-metrics.core";
import { summarizeInvoiceLedger } from "./invoice-financial-lifecycle.core";
import { InvoicePdfViewModelService } from "./invoice-pdf-view-model.service";
import {
  assertInvoiceCanBeReopened,
  assertInvoiceFinancialsMutable,
  assertPaymentDoesNotExceedBalance,
  InvoiceLedgerLocksFinancialsError,
  InvoiceReopenFrozenError,
  PaymentExceedsBalanceError,
} from "./invoice-native-ledger-policy";
import {
  InvoiceTaxContextMissingError,
  InvoiceTaxRateMismatchError,
  InvoiceTaxRateOutOfRangeError,
  resolveServerDocumentTaxRateBps,
} from "./invoice-tax-policy";
import type { InvoiceCustomerFacingSnapshotV2 } from "./invoice-customer-facing-snapshot.types";
import { INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION_V2 } from "./invoice-customer-facing-snapshot.types";

function expect(name: string, run: () => void | Promise<void>) {
  try {
    const result = run();
    if (result && typeof (result as Promise<void>).then === "function") {
      return (result as Promise<void>).then(
        () => console.log(`PASS ${name}`),
        (error) => {
          console.error(`FAIL ${name}`, error);
          process.exitCode = 1;
        },
      );
    }
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
    return Promise.resolve();
  }

  console.log(`PASS ${name}`);
  return Promise.resolve();
}

function payment(amountCents: number, entryType: "payment" | "refund" | "adjustment" = "payment") {
  return {
    entry_type: entryType,
    amount_cents: amountCents,
    occurred_at: new Date("2026-01-02T12:00:00.000Z"),
  };
}

function summarize(totalCents: number, payments: ReturnType<typeof payment>[]) {
  return summarizeInvoiceLedger({
    totalCents,
    legacyStatus: "unpaid",
    legacyPaidAt: null,
    payments: payments as never,
    financeOrigin: "native_wizfield",
  });
}

const repoRoot = join(__dirname, "..", "..", "..");

async function main() {
  await expect("client tax values cannot replace the branch rate", () => {
    for (const clientRate of [0, 500, 100_000]) {
      assert.throws(
        () => resolveServerDocumentTaxRateBps({
          branchId: "branch-1",
          branchDefaultTaxRateBps: 1300,
          clientTaxRateBps: clientRate,
        }),
        InvoiceTaxRateMismatchError,
      );
    }

    assert.equal(
      resolveServerDocumentTaxRateBps({
        branchId: "branch-1",
        branchDefaultTaxRateBps: 1300,
        clientTaxRateBps: undefined,
      }),
      1300,
    );
    assert.equal(
      resolveServerDocumentTaxRateBps({
        branchId: "branch-1",
        branchDefaultTaxRateBps: 1300,
        clientTaxRateBps: 1300,
      }),
      1300,
    );
  });

  await expect("missing branch tax context is rejected and an explicit 0 rate is kept", () => {
    assert.throws(
      () => resolveServerDocumentTaxRateBps({
        branchId: null,
        branchDefaultTaxRateBps: null,
        clientTaxRateBps: 0,
      }),
      InvoiceTaxContextMissingError,
    );
    assert.equal(
      resolveServerDocumentTaxRateBps({
        branchId: "branch-1",
        branchDefaultTaxRateBps: 0,
        clientTaxRateBps: undefined,
      }),
      0,
    );
    assert.throws(
      () => resolveServerDocumentTaxRateBps({
        branchId: "branch-1",
        branchDefaultTaxRateBps: 100_000,
        clientTaxRateBps: undefined,
      }),
      InvoiceTaxRateOutOfRangeError,
    );
  });

  await expect("normal payment above the balance is rejected", () => {
    assert.throws(
      () => assertPaymentDoesNotExceedBalance({ entryType: "payment", amountCents: 10_001, balanceCents: 10_000 }),
      PaymentExceedsBalanceError,
    );
    assert.doesNotThrow(() => assertPaymentDoesNotExceedBalance({
      entryType: "payment",
      amountCents: 10_000,
      balanceCents: 10_000,
    }));
    assert.throws(
      () => assertPaymentDoesNotExceedBalance({ entryType: "payment", amountCents: 1, balanceCents: 0 }),
      PaymentExceedsBalanceError,
    );
  });

  await expect("ledger activity blocks financial replacement", () => {
    assert.throws(() => assertInvoiceFinancialsMutable(1), InvoiceLedgerLocksFinancialsError);
    assert.doesNotThrow(() => assertInvoiceFinancialsMutable(0));
  });

  await expect("frozen invoice open leaves signature and snapshot untouched", () => {
    const invoice: {
      signed_at: Date | null;
      signed_by_name: string | null;
      approved_at: Date | null;
      customer_facing_snapshot_json: string | null;
    } = {
      signed_at: new Date("2026-02-01T00:00:00.000Z"),
      signed_by_name: "Ada Customer",
      approved_at: new Date("2026-02-01T00:00:00.000Z"),
      customer_facing_snapshot_json: "{\"schema_version\":3}",
    };

    assert.throws(() => {
      assertInvoiceCanBeReopened(true);
      invoice.signed_at = null;
      invoice.signed_by_name = null;
      invoice.approved_at = null;
      invoice.customer_facing_snapshot_json = null;
    }, InvoiceReopenFrozenError);

    assert.equal(invoice.signed_by_name, "Ada Customer");
    assert.ok(invoice.signed_at);
    assert.ok(invoice.approved_at);
    assert.equal(invoice.customer_facing_snapshot_json, "{\"schema_version\":3}");

    const controller = readFileSync(join(__dirname, "crm.controller.ts"), "utf8");
    const openIndex = controller.indexOf('@Post("invoices/:invoiceId/open")');
    assert.ok(openIndex >= 0);
    const window = controller.slice(openIndex, openIndex + 1600);
    const guardAt = window.indexOf("assertInvoiceCanBeReopened");
    const clearAt = window.indexOf("invoice.signed_at = null");
    assert.ok(guardAt >= 0 && clearAt > guardAt);
  });

  await expect("provider failure does not commit the frozen snapshot and retry keeps one number", async () => {
    const calls: string[] = [];
    await assert.rejects(() => executeCustomerSend({
      reserveDocumentNumber: async () => {
        calls.push("reserve");
        return "1001";
      },
      buildUnsavedSnapshot: (documentNumber) => ({ documentNumber, label: "HST" }),
      deliver: async () => {
        calls.push("deliver");
        throw new Error("smtp down");
      },
      commitFrozenSnapshot: async () => {
        calls.push("commit");
      },
    }));
    assert.deepEqual(calls, ["reserve", "deliver"]);

    let committed: string | null = null;
    const sent = await executeCustomerSend({
      reserveDocumentNumber: async () => "1001",
      buildUnsavedSnapshot: (documentNumber) => ({ documentNumber, label: "HST" }),
      deliver: async () => {
        calls.push("deliver-retry");
      },
      commitFrozenSnapshot: async ({ documentNumber }) => {
        committed = documentNumber;
      },
    });
    assert.equal(sent.documentNumber, "1001");
    assert.equal(committed, "1001");
    assert.equal(sent.snapshot.label, "HST");
  });

  await expect("frozen document keeps the snapshotted HST label after the branch label changes", () => {
    const snapshot = {
      schema_version: INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION_V2,
      frozen_at: "2026-03-01T00:00:00.000Z",
      frozen_via: "email",
      invoice_id: "inv-1",
      document_number: "1001",
      issued_at: "2026-03-01T00:00:00.000Z",
      due_at: null,
      description: "Service",
      business: {
        businessName: "WizField",
        displayInitials: "WF",
        phone: null,
        email: null,
        website: null,
        logoUrl: null,
        accentColor: null,
        paymentInstructions: null,
        businessLicense: null,
        gstNumber: null,
        warrantyMessage: null,
        invoicePdfFooter: null,
        companyAddress: null,
      },
      bill_to: {
        name: "Customer",
        company: null,
        email: null,
        phone: null,
        address_lines: [],
      },
      service_location: { address_lines: [] },
      job_reference: { job_id: "job-1", title: "Job", service_type: "service" },
      financial: {
        subtotal_cents: 10_000,
        tax_rate_bps: 1300,
        tax_cents: 1300,
        total_cents: 11_300,
        discount_cents: 0,
      },
      lines: [],
      branch: {
        branch_id: "branch-1",
        branch_code: "YYC",
        branch_name: "Calgary",
        phone: null,
        email: null,
        website: null,
        address: null,
        city: null,
        province: null,
        postal: null,
        tax_label: "HST",
        tax_number: null,
        logo: null,
        template_version: "v1",
      },
    } satisfies InvoiceCustomerFacingSnapshotV2;

    assert.equal(readSnapshottedBranchTaxLabel(snapshot), "HST");
    assert.equal(resolveCustomerDocumentTaxLabel({
      taxRateBps: 1300,
      snapshottedTaxLabel: "HST",
    }), "HST");

    const service = new InvoicePdfViewModelService({
      parseSnapshot: () => null,
    } as never, new DocumentBrandingSnapshotService());
    const ledger = summarize(11_300, []);
    const frozenView = service.build({
      invoice: { payments: [] } as unknown as InvoiceEntity,
      customer: null,
      job: null,
      orgSettings: null,
      ledgerSummary: ledger,
      dueDays: 30,
      formatCents: (cents) => `$${(cents / 100).toFixed(2)}`,
      formatDisplayDate: () => "Mar 1, 2026",
      formatDueDate: () => null,
      sanitizeDescription: (value) => value,
      sanitizeLineText: (value) => value ?? null,
      customerFacingSnapshot: snapshot,
      branchTaxLabel: "GST",
    });
    assert.equal(frozenView.financial_summary.tax_label, "HST");

    const liveView = service.build({
      invoice: {
        payments: [],
        customer_facing_snapshot_json: null,
        issued_at: new Date("2026-03-01T00:00:00.000Z"),
        due_at: null,
        document_number: "DRAFT",
        description: "Draft",
        subtotal_cents: 10_000,
        tax_rate_bps_snapshot: 1300,
        tax_cents: 1300,
        total_cents: 11_300,
        amount_cents: 11_300,
        line_items: [],
      } as unknown as InvoiceEntity,
      customer: null,
      job: null,
      orgSettings: null,
      ledgerSummary: ledger,
      dueDays: 30,
      formatCents: (cents) => `$${(cents / 100).toFixed(2)}`,
      formatDisplayDate: () => "Mar 1, 2026",
      formatDueDate: () => null,
      sanitizeDescription: (value) => value,
      sanitizeLineText: (value) => value ?? null,
      branchTaxLabel: "GST",
    });
    assert.equal(liveView.financial_summary.tax_label, "GST");
  });

  await expect("invoice list, dashboard, and customer invoiced amount share one definition", () => {
    const unpaid = {
      totalCents: 10_000,
      payments: [] as ReturnType<typeof payment>[],
    };
    const partial = {
      totalCents: 10_000,
      payments: [payment(4_000)],
    };
    const paid = {
      totalCents: 10_000,
      payments: [payment(10_000)],
    };
    const refunded = {
      totalCents: 10_000,
      payments: [payment(10_000), payment(10_000, "refund")],
    };
    const overpaid = {
      totalCents: 10_000,
      payments: [payment(12_000)],
    };
    const zero = {
      totalCents: 0,
      payments: [] as ReturnType<typeof payment>[],
    };
    const rows = [unpaid, partial, paid, refunded, overpaid, zero].map((row) => {
      const ledger = summarize(row.totalCents, row.payments);
      return {
        ledger,
        cashCollectedCents: cashCollectedCentsFromPayments(row.payments),
        invoicedCents: row.totalCents,
        open: isCollectibleOpenInvoice(ledger.lifecycleStatus, ledger.balanceCents),
      };
    });

    assert.deepEqual(rows.map((row) => row.ledger.lifecycleStatus), [
      "sent",
      "partial",
      "paid",
      "refunded",
      "overpaid",
      "paid",
    ]);
    assert.deepEqual(rows.map((row) => row.open), [true, true, false, true, false, false]);
    assert.equal(rows.filter((row) => row.open).reduce((sum, row) => sum + row.ledger.balanceCents, 0), 26_000);
    assert.equal(rows.reduce((sum, row) => sum + row.cashCollectedCents, 0), 26_000);
    assert.equal(rows.reduce((sum, row) => sum + row.invoicedCents, 0), 50_000);
    assert.equal(rows[2]?.cashCollectedCents, 10_000);
    assert.notEqual(rows[4]?.cashCollectedCents, rows[4]?.invoicedCents);

    const dashboard = readFileSync(join(__dirname, "crm-office-dashboard.service.ts"), "utf8");
    const presentation = readFileSync(join(__dirname, "finance-invoice-presentation.service.ts"), "utf8");
    const invoicePage = readFileSync(join(repoRoot, "frontend", "app", "invoices", "page.tsx"), "utf8");
    const customerProfile = readFileSync(
      join(repoRoot, "frontend", "app", "customers", "[customerId]", "customer-profile-workspace.tsx"),
      "utf8",
    );
    const english = readFileSync(join(repoRoot, "frontend", "messages", "en.ts"), "utf8");

    assert.match(dashboard, /isCollectibleOpenInvoice/);
    assert.match(presentation, /isCollectibleOpenInvoice/);
    assert.match(presentation, /cash_collected_cents/);
    assert.match(invoicePage, /lifecycle_status === "sent"/);
    assert.match(invoicePage, /lifecycle_status === "partial"/);
    assert.match(invoicePage, /lifecycle_status === "refunded"/);
    assert.match(invoicePage, /cash_collected_cents/);
    assert.match(customerProfile, /invoice\.total_cents/);
    assert.match(english, /depositsHeld: "Partial payments"/);
    assert.match(english, /paidInvoices: "Cash collected"/);
    assert.match(english, /totalRevenue: "Invoiced"/);
    assert.doesNotMatch(english, /Deposits held/);
  });
}

main().then(() => {
  if (process.exitCode) {
    process.exit(process.exitCode);
  }
  console.log("finance-integrity-unit-check complete");
});
