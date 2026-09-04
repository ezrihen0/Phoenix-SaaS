import "dotenv/config";
import "reflect-metadata";

import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { HomeAiCrmReadService } from "../ai/home-ai-crm-read.service";
import type { ActorContext } from "../common/request-types";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoiceServiceIntelligenceEntity } from "./entities/invoice-service-intelligence.entity";
import { JobEntity } from "./entities/job.entity";
import { LeadEntity } from "./entities/lead.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { QuoteEntity } from "./entities/quote.entity";
import { WarrantyCertificateEntity } from "./entities/warranty-certificate.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { PHOENIX_ORG_ID } from "./workiz-service-intelligence-discovery";

const PHOENIX_ORG_SLUG = "phoenix-fireplace";

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Service Intelligence validation currently supports MySQL only.");
  }
  return {
    ...(options as MysqlConnectionOptions),
    synchronize: false,
    migrationsRun: false,
    logging: false,
  };
}

async function main() {
  const dataSource = new DataSource(requireMySqlOptions());
  await dataSource.initialize();

  try {
    const org = await dataSource.getRepository(OrganizationEntity).findOne({
      where: { id: PHOENIX_ORG_ID, slug: PHOENIX_ORG_SLUG },
    });
    if (!org) {
      throw new Error("Phoenix organization was not found.");
    }

    const crmRead = new HomeAiCrmReadService(
      dataSource.getRepository(CustomerEntity),
      dataSource.getRepository(LeadEntity),
      dataSource.getRepository(JobEntity),
      dataSource.getRepository(QuoteEntity),
      dataSource.getRepository(InvoiceEntity),
      dataSource.getRepository(InvoiceServiceIntelligenceEntity),
      dataSource.getRepository(WarrantyCertificateEntity),
    );

    const actor = {
      organization_id: org.id,
      permissions: ["customers.view", "invoices.view"],
    } as ActorContext;

    const wett = await crmRead.searchServiceHistory(actor, org.id, { serviceDetail: "WETT", limit: 5 });
    const pilots = await crmRead.searchServiceHistory(actor, org.id, {
      component: "pilot",
      workAction: "replaced",
      limit: 5,
    });
    const valves = await crmRead.searchServiceHistory(actor, org.id, {
      component: "gas valve",
      workAction: "replaced",
      limit: 5,
    });
    const sweeps = await crmRead.searchServiceHistory(actor, org.id, { serviceDetail: "chimney sweep", limit: 5 });
    const warranties = await crmRead.searchServiceHistory(actor, org.id, {
      warrantyStatus: "DOCUMENTED_ACTIVE",
      limit: 5,
    });

    const wettLatest = wett.ok ? wett.data.latest as {
      serviceDate: string | null;
      customerName: string | null;
      invoiceCode: string | null;
      invoiceId: string;
      confidence: string;
    } | null : null;

    console.log(JSON.stringify({
      ok: wett.ok && pilots.ok && valves.ok && sweeps.ok && warranties.ok,
      organizationId: org.id,
      question: "When was the last time I had a WETT inspection done?",
      wettToolResult: wett.ok ? {
        source: wett.data.source,
        matchCount: wett.data.matchCount,
        latest: wettLatest,
        records: wett.data.records,
        appliedFilters: wett.data.appliedFilters,
        guidance: wett.data.guidance,
      } : wett,
      wettHistoricalCount: wett.ok ? wett.data.matchCount : null,
      latestWettDate: wettLatest?.serviceDate ?? null,
      latestWettCustomer: wettLatest?.customerName ?? null,
      latestWettInvoice: wettLatest?.invoiceCode ?? wettLatest?.invoiceId ?? null,
      latestWettConfidence: wettLatest?.confidence ?? null,
      pilotReplacement: pilots.ok ? { matchCount: pilots.data.matchCount, latest: pilots.data.latest } : pilots,
      gasValve: valves.ok ? { matchCount: valves.data.matchCount, latest: valves.data.latest } : valves,
      chimneySweep: sweeps.ok ? { matchCount: sweeps.data.matchCount, latest: sweeps.data.latest } : sweeps,
      documentedActiveWarranty: warranties.ok
        ? { matchCount: warranties.data.matchCount, latest: warranties.data.latest }
        : warranties,
    }, null, 2));
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
