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

function normalizeEmail(email) {
  if (!email) return null;
  const v = String(email).trim().toLowerCase();
  return v || null;
}

function normalizePhone(phone) {
  const d = String(phone ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d : null;
}

const workizCustomerWhere = `
  organization_id = ?
  AND (
    JSON_CONTAINS(tags, '"WORKIZ"')
    OR JSON_CONTAINS(tags, '"HISTORICAL_IMPORT"')
    OR external_client_number LIKE 'workiz:%'
  )
`;

const [customersTotal] = await conn.query(
  "SELECT COUNT(*) AS c, MAX(created_at) AS newest_created_at, MAX(updated_at) AS newest_updated_at FROM customers WHERE organization_id = ?",
  [ORG],
);
const [workizTagged] = await conn.query(
  "SELECT COUNT(*) AS c FROM customers WHERE organization_id = ? AND JSON_CONTAINS(tags, '\"WORKIZ\"')",
  [ORG],
);
const [workizExternalKey] = await conn.query(
  "SELECT COUNT(*) AS c FROM customers WHERE organization_id = ? AND external_client_number LIKE 'workiz:%'",
  [ORG],
);
const [workizCustomerCohort] = await conn.query(
  `SELECT id, email, phone, external_client_number, created_at, updated_at
   FROM customers WHERE ${workizCustomerWhere}`,
  [ORG],
);

const emailGroups = new Map();
const phoneGroups = new Map();
const externalGroups = new Map();
for (const row of workizCustomerCohort) {
  const email = normalizeEmail(row.email);
  if (email) emailGroups.set(email, (emailGroups.get(email) ?? 0) + 1);
  const phone = normalizePhone(row.phone);
  if (phone) phoneGroups.set(phone, (phoneGroups.get(phone) ?? 0) + 1);
  const ext = row.external_client_number?.trim();
  if (ext) externalGroups.set(ext, (externalGroups.get(ext) ?? 0) + 1);
}

const dupEmails = [...emailGroups.entries()].filter(([, n]) => n > 1).map(([k, n]) => ({ email: k, count: n }));
const dupPhones = [...phoneGroups.entries()].filter(([, n]) => n > 1).map(([k, n]) => ({ phone: k, count: n }));
const dupExternal = [...externalGroups.entries()].filter(([, n]) => n > 1).map(([k, n]) => ({ externalKey: k, count: n }));

const workizInvoiceFilter = "organization_id = ? AND branding_snapshot_json LIKE '%workiz_historical_import%'";

const [workizInvoices] = await conn.query(
  `SELECT COUNT(*) AS c, MAX(created_at) AS newest_created_at, MAX(updated_at) AS newest_updated_at
   FROM invoices WHERE ${workizInvoiceFilter}`,
  [ORG],
);
const [batchIds] = await conn.query(
  `SELECT JSON_UNQUOTE(JSON_EXTRACT(branding_snapshot_json, '$.production_batch_id')) AS batch_id,
          COUNT(*) AS c
   FROM invoices WHERE ${workizInvoiceFilter}
   GROUP BY batch_id`,
  [ORG],
);

const [workizJobs] = await conn.query(
  `SELECT COUNT(*) AS c, MAX(j.created_at) AS newest_created_at, MAX(j.updated_at) AS newest_updated_at
   FROM jobs j
   INNER JOIN invoices i ON i.job_id = j.id
   WHERE j.organization_id = ? AND i.branding_snapshot_json LIKE '%workiz_historical_import%'`,
  [ORG],
);

const [workizPayments] = await conn.query(
  `SELECT COUNT(*) AS c, MAX(p.created_at) AS newest_created_at, MAX(p.updated_at) AS newest_updated_at
   FROM invoice_payments p
   INNER JOIN invoices i ON i.id = p.invoice_id
   WHERE i.organization_id = ? AND i.branding_snapshot_json LIKE '%workiz_historical_import%'`,
  [ORG],
);

const [workizDocs] = await conn.query(
  `SELECT COUNT(*) AS c, MAX(d.created_at) AS newest_created_at, MAX(d.updated_at) AS newest_updated_at
   FROM invoice_documents d
   INNER JOIN invoices i ON i.id = d.invoice_id
   WHERE d.organization_id = ? AND i.branding_snapshot_json LIKE '%workiz_historical_import%'`,
  [ORG],
);

const [workizSi] = await conn.query(
  `SELECT COUNT(*) AS c, MAX(s.created_at) AS newest_created_at, MAX(s.updated_at) AS newest_updated_at
   FROM invoice_service_intelligence s
   INNER JOIN invoices i ON i.id = s.invoice_id
   WHERE s.organization_id = ? AND i.branding_snapshot_json LIKE '%workiz_historical_import%'`,
  [ORG],
);

const [workizWarranty] = await conn.query(
  `SELECT COUNT(*) AS c, MAX(w.created_at) AS newest_created_at, MAX(w.updated_at) AS newest_updated_at
   FROM invoice_service_intelligence_warranty w
   INNER JOIN invoices i ON i.id = w.invoice_id
   WHERE w.organization_id = ? AND i.branding_snapshot_json LIKE '%workiz_historical_import%'`,
  [ORG],
);

const [workizCustomerNewest] = await conn.query(
  `SELECT MAX(created_at) AS newest_created_at, MAX(updated_at) AS newest_updated_at
   FROM customers WHERE ${workizCustomerWhere}`,
  [ORG],
);

const snapshot = {
  capturedAt: new Date().toISOString(),
  organizationId: ORG,
  customers: {
    total: Number(customersTotal[0].c),
    workizTagged: Number(workizTagged[0].c),
    withWorkizExternalKey: Number(workizExternalKey[0].c),
    workizCohortRows: workizCustomerCohort.length,
    duplicateNormalizedEmails: dupEmails.length,
    duplicateNormalizedPhones: dupPhones.length,
    duplicateWorkizExternalKeys: dupExternal.length,
    duplicateEmailSamples: dupEmails.slice(0, 15),
    duplicatePhoneSamples: dupPhones.slice(0, 15),
    duplicateExternalKeySamples: dupExternal.slice(0, 15),
    newestCreatedAt: workizCustomerNewest[0].newest_created_at,
    newestUpdatedAt: workizCustomerNewest[0].newest_updated_at,
  },
  workizHistoricalImport: {
    jobs: { count: Number(workizJobs[0].c), newestCreatedAt: workizJobs[0].newest_created_at, newestUpdatedAt: workizJobs[0].newest_updated_at },
    invoices: { count: Number(workizInvoices[0].c), newestCreatedAt: workizInvoices[0].newest_created_at, newestUpdatedAt: workizInvoices[0].newest_updated_at },
    payments: { count: Number(workizPayments[0].c), newestCreatedAt: workizPayments[0].newest_created_at, newestUpdatedAt: workizPayments[0].newest_updated_at },
    sourceDocuments: { count: Number(workizDocs[0].c), newestCreatedAt: workizDocs[0].newest_created_at, newestUpdatedAt: workizDocs[0].newest_updated_at },
    serviceIntelligenceRows: { count: Number(workizSi[0].c), newestCreatedAt: workizSi[0].newest_created_at, newestUpdatedAt: workizSi[0].newest_updated_at },
    warrantyRows: { count: Number(workizWarranty[0].c), newestCreatedAt: workizWarranty[0].newest_created_at, newestUpdatedAt: workizWarranty[0].newest_updated_at },
    productionBatchIds: batchIds,
  },
  expectedCohort: {
    customerClusters: 334,
    newCustomersApprox: 328,
    existingMatchesApprox: 6,
    jobs: 339,
    invoices: 339,
    payments: 439,
    sourceDocuments: 339,
  },
  preWriteGateBaseline: { customers: 54, invoices: 31, jobs: 50, payments: 30, sourceDocuments: 10 },
};

console.log(JSON.stringify(snapshot, null, 2));
await conn.end();
