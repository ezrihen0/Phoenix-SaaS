import "dotenv/config";
import "reflect-metadata";

import { DataSource } from "typeorm";

import { buildDataSourceOptions } from "./typeorm.config";
import { CustomerEntity } from "./entities/customer.entity";
import { JobEntity } from "./entities/job.entity";
import { JOBBER_CUSTOMER_TAG } from "./jobber/customer-tags";
import { parseJobberJobProvenance } from "./jobber/jobber-job-provenance";
import { JOBBER_HISTORICAL_IMPORT_SOURCE } from "./jobber/jobber-job-provenance";
import { loadExistingJobberImportIndex } from "./jobber/jobber-invoice-upsert";
import { resolvePhoenixOperatingOrganization } from "./jobber/phoenix-org-resolver";
import { isoDateKeyFromUtcInstant } from "../integrations/phoenix/phoenix-scheduling-timezone";

async function main() {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  try {
    const org = await resolvePhoenixOperatingOrganization(dataSource);
    const todayIso = isoDateKeyFromUtcInstant(new Date(), "ON");

    const customers = await dataSource.getRepository(CustomerEntity).find({
      where: { organization_id: org.id },
    });
    const jobberTaggedCustomers = customers.filter((customer) =>
      Array.isArray(customer.tags) && customer.tags.includes(JOBBER_CUSTOMER_TAG),
    );

    const jobs = await dataSource.getRepository(JobEntity).find({
      where: { organization_id: org.id },
    });
    const jobberJobs = jobs.filter((job) => parseJobberJobProvenance(job.description));

    const futureScheduled = jobberJobs.filter((job) => {
      if (!job.scheduled_for) return false;
      const iso = isoDateKeyFromUtcInstant(job.scheduled_for, "ON");
      return iso >= todayIso && job.status === "scheduled";
    });

    const invoiceIndex = await loadExistingJobberImportIndex(dataSource, org.id);

    const report = {
      organizationId: org.id,
      organizationSlug: org.slug,
      customersWithJobberTag: jobberTaggedCustomers.length,
      jobberVisitJobs: jobberJobs.length,
      futureScheduledJobberJobs: futureScheduled.length,
      jobberImportedInvoices: invoiceIndex.size,
      sampleJobberInvoiceNumbers: [...invoiceIndex.keys()].slice(0, 5),
      importSourceConstant: JOBBER_HISTORICAL_IMPORT_SOURCE,
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
