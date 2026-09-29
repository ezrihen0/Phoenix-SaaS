import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const payloadFile = join(__dirname, "phoenix-pilot-d3-payload.json");
const file = JSON.parse(readFileSync(payloadFile, "utf8"));

const secret = process.env.PHOENIX_INTEGRATION_SECRET || process.env.WIZFIELD_INTEGRATION_SECRET || "";
if (!secret) {
  console.error("missing_integration_secret_on_server");
  process.exit(1);
}

function request(method, path, requestBody) {
  return new Promise((resolve, reject) => {
    const data = requestBody ? JSON.stringify(requestBody) : "";
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: Number(process.env.PORT || process.env.BACKEND_PORT || 4000),
        path,
        method,
        headers: {
          Authorization: `Bearer ${secret}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode, text });
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

const orgId = encodeURIComponent(file.organizationId);
const exportRes = await request("GET", `/api/integrations/phoenix/customers/export?organizationId=${orgId}`);
const exportJson = JSON.parse(exportRes.text);
const customers = exportJson?.data?.customers || [];

const pilotBySourceId = new Map(file.customers.map((row) => [row.sourceCustomerId, row]));
const imported = customers.filter(
  (customer) =>
    customer.provenance?.importBatch === file.importBatch
    && pilotBySourceId.has(customer.provenance?.sourceCustomerId || customer.externalClientNumber || ""),
);

const checks = imported.map((customer) => {
  const sourceId = customer.provenance?.sourceCustomerId || customer.externalClientNumber;
  const expected = pilotBySourceId.get(sourceId);
  return {
    sourceCustomerId: sourceId,
    customerId: customer.id,
    organizationOk: true,
    nameOk: customer.name === expected?.name,
    emailOk: (customer.email || "").toLowerCase() === (expected?.email || "").toLowerCase(),
    phoneOk: (customer.phone || "").replace(/\D/g, "") === (expected?.phone || "").replace(/\D/g, ""),
    provenanceOk: Boolean(customer.provenance?.sourceReference && customer.provenance?.importedAt),
  };
});

const mysql = await import("mysql2/promise");
const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
});

const customerIds = imported.map((row) => row.id);
let jobCount = 0;
let invoiceCount = 0;
let documentCount = 0;
let magicLinkCount = 0;

if (customerIds.length > 0) {
  const placeholders = customerIds.map(() => "?").join(",");
  const [jobs] = await connection.query(
    `SELECT COUNT(*) AS count FROM jobs WHERE customer_id IN (${placeholders})`,
    customerIds,
  );
  jobCount = Number(jobs[0]?.count || 0);

  const [invoices] = await connection.query(
    `SELECT COUNT(*) AS count FROM invoices i
     INNER JOIN jobs j ON j.id = i.job_id
     WHERE j.customer_id IN (${placeholders})`,
    customerIds,
  );
  invoiceCount = Number(invoices[0]?.count || 0);

  const [documents] = await connection.query(
    `SELECT COUNT(*) AS count FROM invoice_documents d
     INNER JOIN invoices i ON i.id = d.invoice_id
     INNER JOIN jobs j ON j.id = i.job_id
     WHERE j.customer_id IN (${placeholders})`,
    customerIds,
  );
  documentCount = Number(documents[0]?.count || 0);

  const [magicLinks] = await connection.query(
    `SELECT COUNT(*) AS count FROM portal_magic_links WHERE customer_id IN (${placeholders})`,
    customerIds,
  );
  magicLinkCount = Number(magicLinks[0]?.count || 0);
}

await connection.end();

process.stdout.write(
  `${JSON.stringify(
    {
      phoenixCustomerCount: customers.length,
      importedPilotCount: imported.length,
      fieldChecks: checks,
      accidentalJobs: jobCount,
      accidentalInvoices: invoiceCount,
      accidentalDocuments: documentCount,
      portalMagicLinksForImportedCustomers: magicLinkCount,
    },
    null,
    2,
  )}\n`,
);
