import "dotenv/config";
import "reflect-metadata";

import { DataSource, Not } from "typeorm";

import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { InvoicePaymentEntity } from "./entities/invoice-payment.entity";
import { JobEntity } from "./entities/job.entity";
import { LeadEntity } from "./entities/lead.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { QuoteEntity } from "./entities/quote.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { HomeAiCrmReadService } from "../ai/home-ai-crm-read.service";
import type { ActorContext } from "../common/request-types";

const PHOENIX_ID = "90137527-3fd0-435c-9032-358f7f670662";
const IMPORT_SOURCE = "workiz_historical_import";

function isWorkizImport(invoice: InvoiceEntity): boolean {
  if (!invoice.branding_snapshot_json) return false;
  try {
    const snapshot = JSON.parse(invoice.branding_snapshot_json) as { import_source?: string };
    return snapshot.import_source === IMPORT_SOURCE;
  } catch {
    return false;
  }
}

async function main() {
  const ds = new DataSource(buildDataSourceOptions());
  await ds.initialize();

  try {
    const invoiceRepo = ds.getRepository(InvoiceEntity);
    const phoenixInvoices = await invoiceRepo.find({ where: { organization_id: PHOENIX_ID } });
    const importedInvoices = phoenixInvoices.filter(isWorkizImport);
    const foreignImported = await invoiceRepo
      .createQueryBuilder("invoice")
      .where("invoice.organization_id <> :organizationId", { organizationId: PHOENIX_ID })
      .andWhere("invoice.branding_snapshot_json LIKE :source", { source: `%${IMPORT_SOURCE}%` })
      .getCount();

    const customers = await ds.getRepository(CustomerEntity).count({ where: { organization_id: PHOENIX_ID } });
    const jobs = await ds.getRepository(JobEntity).count({ where: { organization_id: PHOENIX_ID } });
    const importedIds = importedInvoices.map((invoice) => invoice.id);
    const lineItems = importedIds.length === 0
      ? 0
      : await ds.getRepository(InvoiceLineItemEntity).count({ where: { invoice_id: Not("") } })
          .then(async () => {
            return ds.getRepository(InvoiceLineItemEntity)
              .createQueryBuilder("line")
              .where("line.invoice_id IN (:...ids)", { ids: importedIds })
              .getCount();
          });
    const payments = importedIds.length === 0
      ? 0
      : await ds.getRepository(InvoicePaymentEntity)
          .createQueryBuilder("payment")
          .where("payment.invoice_id IN (:...ids)", { ids: importedIds })
          .getCount();

    const totalHistoricalInvoiceValueCents = importedInvoices.reduce((sum, invoice) => sum + invoice.total_cents, 0);
    const totalOutstandingBalanceCents = importedInvoices
      .filter((invoice) => invoice.status !== "paid")
      .reduce((sum, invoice) => sum + invoice.total_cents, 0);

    const paymentRows = importedIds.length === 0
      ? []
      : await ds.getRepository(InvoicePaymentEntity)
          .createQueryBuilder("payment")
          .where("payment.invoice_id IN (:...ids)", { ids: importedIds })
          .getMany();
    const totalPaymentsCents = paymentRows.reduce((sum, payment) => sum + payment.amount_cents, 0);

    const recentInvoices = [...importedInvoices]
      .sort((a, b) => (b.issued_at?.getTime() ?? 0) - (a.issued_at?.getTime() ?? 0))
      .slice(0, 5)
      .map((invoice) => ({
        description: invoice.description,
        totalCents: invoice.total_cents,
        status: invoice.status,
        issuedAt: invoice.issued_at?.toISOString() ?? null,
      }));

    const organization = await ds.getRepository(OrganizationEntity).findOneOrFail({
      where: { id: PHOENIX_ID },
    });
    const ownerActor = {
      user: { id: "verify-user", email: "admin@phoenixcrm.local" },
      profile: { id: "verify-profile", full_name: "Phoenix Admin", phone: null, role: "owner" },
      technician: null,
      memberships: [],
      membership: {
        id: "verify-membership",
        organization_id: PHOENIX_ID,
        role: "owner",
        status: "active",
      },
      organization,
      membership_id: "verify-membership",
      organization_id: PHOENIX_ID,
      role: "owner",
      permissions: ["customers.view", "jobs.view", "invoices.view", "estimates.view", "leads.view"],
    } as unknown as ActorContext;

    const crmRead = new HomeAiCrmReadService(
      ds.getRepository(CustomerEntity),
      ds.getRepository(LeadEntity),
      ds.getRepository(JobEntity),
      ds.getRepository(QuoteEntity),
      invoiceRepo,
    );
    const homeAiInvoices = await crmRead.getInvoices(ownerActor, PHOENIX_ID, { limit: 20 });
    const workizVisible = (homeAiInvoices.ok ? homeAiInvoices.data.invoices as Array<{ description?: string }> : [])
      .filter((invoice) => (invoice.description ?? "").includes("Workiz Invoice #"));

    console.log(JSON.stringify({
      ok: foreignImported === 0 && importedInvoices.length === 58,
      importedInvoices: importedInvoices.length,
      foreignImportedInvoices: foreignImported,
      phoenixCustomers: customers,
      phoenixJobs: jobs,
      importedLineItems: lineItems,
      importedPayments: payments,
      totalHistoricalInvoiceValueCents,
      totalOutstandingBalanceCents,
      totalPaymentsCents,
      recentInvoices,
      homeAiInvoiceTool: {
        ok: homeAiInvoices.ok,
        visibleInvoiceCount: homeAiInvoices.ok ? homeAiInvoices.data.count : 0,
        visibleWorkizInvoices: workizVisible.length,
      },
    }, null, 2));
  } finally {
    await ds.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
