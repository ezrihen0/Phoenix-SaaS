import "dotenv/config";
import "reflect-metadata";

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { DataSource, In } from "typeorm";

import { DocumentBrandingSnapshotService } from "../documents/pdf/document-branding-snapshot.service";
import {
  FinanceInvoicePresentationService,
  summarizeCustomerOpenFinanceFromRows,
} from "../crm/finance-invoice-presentation.service";
import { InvoiceCustomerFacingSnapshotService } from "../crm/invoice-customer-facing-snapshot.service";
import { InvoicePaymentLedgerService } from "../crm/invoice-payment-ledger.service";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";

type CheckResult = { name: string; ok: boolean; detail?: unknown };

async function resolveOrganizationId(dataSource: DataSource) {
  const fromEnv = process.env.PHOENIX_ORG_ID?.trim() || process.env.FINANCE_AUDIT_ORG_ID?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const slug = process.env.PHOENIX_ORG_SLUG?.trim() || "phoenix-fireplace";
  const org = await dataSource.getRepository(OrganizationEntity).findOne({ where: { slug } });
  return org?.id ?? "";
}

async function main() {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  const results: CheckResult[] = [];
  const organizationId = await resolveOrganizationId(dataSource);

  if (!organizationId) {
    await dataSource.destroy();
    console.error("Could not resolve organization for cross-surface readonly check.");
    process.exit(1);
  }

  const presentationService = new FinanceInvoicePresentationService(
    new InvoicePaymentLedgerService(),
    new InvoiceCustomerFacingSnapshotService(new DocumentBrandingSnapshotService()),
  );

  const invoices = await dataSource.getRepository(InvoiceEntity).find({
    where: { organization_id: organizationId },
    relations: { payments: true, line_items: true },
    take: 2000,
  });

  const jobIds = [...new Set(invoices.map((row) => row.job_id).filter(Boolean))];
  const jobs = jobIds.length
    ? await dataSource.getRepository(JobEntity).find({
      where: { organization_id: organizationId, id: In(jobIds) },
    })
    : [];
  const jobById = new Map(jobs.map((job) => [job.id, job]));

  const customerIds = [...new Set(jobs.map((job) => job.customer_id).filter(Boolean))];
  const customers = customerIds.length
    ? await dataSource.getRepository(CustomerEntity).find({
      where: { organization_id: organizationId, id: In(customerIds) },
    })
    : [];
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));

  let presentationMismatches = 0;
  for (const invoice of invoices) {
    const presentation = presentationService.buildListPresentation(invoice);
    const listItem = presentationService.buildListItem(
      invoice,
      jobById.get(invoice.job_id) ?? null,
      customerById.get(jobById.get(invoice.job_id)?.customer_id ?? "") ?? null,
      jobById.get(invoice.job_id)?.title ?? "Job",
    );

    if (
      presentation.document_number !== listItem.document_number
      || presentation.balance_cents !== listItem.balance_cents
      || presentation.lifecycle_status !== listItem.lifecycle_status
      || presentation.finance_origin !== listItem.finance_origin
    ) {
      presentationMismatches += 1;
    }
  }

  results.push({
    name: "invoice list presentation matches list item builder",
    ok: presentationMismatches === 0,
    detail: { invoiceSampleSize: invoices.length, presentationMismatches },
  });

  const orgOpen = presentationService.summarizeCustomerOpenFinance(invoices);
  const orgOpenPure = summarizeCustomerOpenFinanceFromRows(invoices);
  results.push({
    name: "customer open finance aggregate matches pure helper",
    ok: orgOpen.open_balance_cents === orgOpenPure.open_balance_cents
      && orgOpen.open_invoice_count === orgOpenPure.open_invoice_count,
    detail: { service: orgOpen, pure: orgOpenPure },
  });

  const invoicesByCustomer = new Map<string, InvoiceEntity[]>();
  for (const invoice of invoices) {
    const customerId = jobById.get(invoice.job_id)?.customer_id;
    if (!customerId) {
      continue;
    }
    const bucket = invoicesByCustomer.get(customerId) ?? [];
    bucket.push(invoice);
    invoicesByCustomer.set(customerId, bucket);
  }

  let customerAggregateMismatches = 0;
  let checkedCustomers = 0;
  for (const [, customerInvoices] of invoicesByCustomer) {
    if (customerInvoices.length === 0) {
      continue;
    }
    checkedCustomers += 1;
    const summary = presentationService.summarizeCustomerOpenFinance(customerInvoices);
    let manualBalance = 0;
    let manualCount = 0;
    for (const invoice of customerInvoices) {
      const row = presentationService.buildListPresentation(invoice);
      const isOpen =
        row.lifecycle_status === "sent"
        || row.lifecycle_status === "partial"
        || row.lifecycle_status === "refunded";
      if (isOpen && row.balance_cents > 0) {
        manualCount += 1;
        manualBalance += row.balance_cents;
      }
    }
    if (summary.open_balance_cents !== manualBalance || summary.open_invoice_count !== manualCount) {
      customerAggregateMismatches += 1;
    }
    if (checkedCustomers >= 25) {
      break;
    }
  }

  results.push({
    name: "per-customer open balance equals sum of open invoice presentations",
    ok: customerAggregateMismatches === 0,
    detail: { checkedCustomers, customerAggregateMismatches },
  });

  let dashboardStyleOpenCount = 0;
  for (const invoice of invoices) {
    const row = presentationService.buildListPresentation(invoice);
    const isOpenLifecycle =
      row.lifecycle_status === "sent"
      || row.lifecycle_status === "partial"
      || row.lifecycle_status === "refunded";
    if (isOpenLifecycle && row.balance_cents > 0) {
      dashboardStyleOpenCount += 1;
    }
  }

  results.push({
    name: "dashboard-style open invoice count matches FIPS open aggregate count",
    ok: dashboardStyleOpenCount === orgOpen.open_invoice_count,
    detail: {
      dashboardStyleOpenCount,
      fipsOpenInvoiceCount: orgOpen.open_invoice_count,
    },
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    organizationId,
    invoiceSampleSize: invoices.length,
    results,
    ok: results.every((row) => row.ok),
  };

  const dir = process.env.FINANCE_CLOSEOUT_DIR?.trim()
    || join(process.cwd(), "_runtime_harness", "finance-program-closeout");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "cross-surface-readonly.json"), JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));

  await dataSource.destroy();

  if (!payload.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
