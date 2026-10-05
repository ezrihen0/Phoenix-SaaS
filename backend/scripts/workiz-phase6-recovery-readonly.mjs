import { execSync } from "node:child_process";
import mysql from "mysql2/promise";

const ORG = "8d5bc762-eb13-43e5-85a1-723477adb47c";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const j = JSON.parse(execSync(`${npx} --yes @railway/cli variables --service MySQL --json`, { encoding: "utf8" }));
const u = new URL(j.MYSQL_PUBLIC_URL);
u.pathname = "/wizfield";

const conn = await mysql.createConnection({
  host: u.hostname,
  port: u.port || 3306,
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: "wizfield",
});

const [invoices] = await conn.query(
  `SELECT COUNT(*) AS c,
          MIN(i.created_at) AS min_created,
          MAX(i.created_at) AS max_created,
          MIN(i.updated_at) AS min_updated,
          MAX(i.updated_at) AS max_updated
   FROM invoices i
   WHERE i.organization_id = ?
     AND i.branding_snapshot_json LIKE '%workiz_historical_import%'`,
  [ORG],
);

const [batchRows] = await conn.query(
  `SELECT JSON_UNQUOTE(JSON_EXTRACT(i.branding_snapshot_json, '$.production_batch_id')) AS batch_id,
          COUNT(*) AS c
   FROM invoices i
   WHERE i.organization_id = ?
     AND i.branding_snapshot_json LIKE '%workiz_historical_import%'
   GROUP BY batch_id`,
  [ORG],
);

const [payments] = await conn.query(
  `SELECT COUNT(*) AS c,
          MIN(p.created_at) AS min_created,
          MAX(p.created_at) AS max_created
   FROM invoice_payments p
   INNER JOIN invoices i ON i.id = p.invoice_id
   WHERE i.organization_id = ?
     AND i.branding_snapshot_json LIKE '%workiz_historical_import%'`,
  [ORG],
);

const [jobs] = await conn.query(
  `SELECT COUNT(*) AS c,
          MIN(j.created_at) AS min_created,
          MAX(j.created_at) AS max_created
   FROM jobs j
   INNER JOIN invoices i ON i.job_id = j.id
   WHERE j.organization_id = ?
     AND i.branding_snapshot_json LIKE '%workiz_historical_import%'`,
  [ORG],
);

const [customers] = await conn.query(
  `SELECT COUNT(DISTINCT j.customer_id) AS c
   FROM jobs j
   INNER JOIN invoices i ON i.job_id = j.id
   WHERE j.organization_id = ?
     AND i.branding_snapshot_json LIKE '%workiz_historical_import%'`,
  [ORG],
);

const [newCustomers] = await conn.query(
  `SELECT COUNT(*) AS c
   FROM customers c
   WHERE c.organization_id = ?
     AND (
       JSON_CONTAINS(c.tags, '"WORKIZ"')
       OR JSON_CONTAINS(c.tags, '"HISTORICAL_IMPORT"')
       OR c.external_client_number LIKE 'workiz:%'
     )`,
  [ORG],
);

const [sourceDocs] = await conn.query(
  `SELECT COUNT(*) AS c
   FROM invoice_documents d
   INNER JOIN invoices i ON i.id = d.invoice_id
   WHERE d.organization_id = ?
     AND i.branding_snapshot_json LIKE '%workiz_historical_import%'`,
  [ORG],
);

const [baselineInvoices] = await conn.query(
  "SELECT COUNT(*) AS c FROM invoices WHERE organization_id = ?",
  [ORG],
);
const [baselineCustomers] = await conn.query(
  "SELECT COUNT(*) AS c FROM customers WHERE organization_id = ?",
  [ORG],
);

const [recentCustomers] = await conn.query(
  "SELECT COUNT(*) AS c FROM customers WHERE organization_id = ? AND created_at >= ?",
  [ORG, "2026-10-04 00:00:00"],
);
const [recentInvoices] = await conn.query(
  "SELECT COUNT(*) AS c FROM invoices WHERE organization_id = ? AND created_at >= ?",
  [ORG, "2026-10-04 00:00:00"],
);

console.log(JSON.stringify({
  orgId: ORG,
  workizHistoricalImportInvoices: Number(invoices[0].c),
  invoiceCreatedRange: { min: invoices[0].min_created, max: invoices[0].max_created },
  invoiceUpdatedRange: { min: invoices[0].min_updated, max: invoices[0].max_updated },
  jobsLinkedToWorkizImports: Number(jobs[0].c),
  jobCreatedRange: { min: jobs[0].min_created, max: jobs[0].max_created },
  paymentsOnWorkizImports: Number(payments[0].c),
  paymentCreatedRange: { min: payments[0].min_created, max: payments[0].max_created },
  distinctCustomersOnWorkizImportJobs: Number(customers[0].c),
  customersWithWorkizTagsOrExternalKey: Number(newCustomers[0].c),
  invoiceDocumentsOnWorkizImports: Number(sourceDocs[0].c),
  productionBatchIds: batchRows,
  orgTotalsNow: {
    invoices: Number(baselineInvoices[0].c),
    customers: Number(baselineCustomers[0].c),
  },
  deltaFromPreWriteGateBaseline: {
    customers: Number(baselineCustomers[0].c) - 54,
    invoices: Number(baselineInvoices[0].c) - 31,
  },
  customersCreatedSince2026Oct04: Number(recentCustomers[0].c),
  invoicesCreatedSince2026Oct04: Number(recentInvoices[0].c),
  expectedCohort: { invoices: 339, jobs: 339, payments: 439, sourceDocuments: 339, customers: "328 new + 6 matched" },
}, null, 2));

await conn.end();
