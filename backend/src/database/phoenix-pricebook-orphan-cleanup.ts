import "../load-env";
import "reflect-metadata";
import { DataSource } from "typeorm";
import { buildDataSourceOptions } from "./typeorm.config";
import { PHOENIX_ORG_ID } from "./workiz/workiz-production-mutation-guard";

async function main() {
  const ds = new DataSource({ ...buildDataSourceOptions(), synchronize: false });
  await ds.initialize();

  const orphanCustomers = await ds.query(
    "SELECT id FROM customers WHERE organization_id = ? AND full_name LIKE 'pb-e2e-%'",
    [PHOENIX_ORG_ID],
  ) as Array<{ id: string }>;

  for (const customer of orphanCustomers) {
    const jobs = await ds.query(
      "SELECT id FROM jobs WHERE organization_id = ? AND customer_id = ?",
      [PHOENIX_ORG_ID, customer.id],
    ) as Array<{ id: string }>;

    for (const job of jobs) {
      const invoices = await ds.query(
        "SELECT id FROM invoices WHERE organization_id = ? AND job_id = ?",
        [PHOENIX_ORG_ID, job.id],
      ) as Array<{ id: string }>;

      for (const invoice of invoices) {
        await ds.query("DELETE FROM invoice_line_items WHERE invoice_id = ?", [invoice.id]);
        await ds.query("DELETE FROM invoices WHERE id = ?", [invoice.id]);
      }

      await ds.query("DELETE FROM job_status_events WHERE job_id = ?", [job.id]);
      await ds.query("DELETE FROM jobs WHERE id = ?", [job.id]);
    }

    await ds.query("DELETE FROM customers WHERE id = ?", [customer.id]);
  }

  await ds.query("DELETE FROM pricebook_items WHERE organization_id = ? AND name LIKE 'pb-e2e-%'", [PHOENIX_ORG_ID]);

  console.log("Removed orphaned pb-e2e verify artifacts from Phoenix org.");
  await ds.destroy();
}

void main();
