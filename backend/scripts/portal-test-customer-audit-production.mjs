/**
 * Read-only reference audit for a Phoenix customer (production wizfield).
 * Usage: node backend/scripts/portal-test-customer-audit-production.mjs <customerId>
 */
import { config } from "dotenv";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import mysql from "mysql2/promise";

const PHOENIX_ORG_ID = "8d5bc762-eb13-43e5-85a1-723477adb47c";
const customerId = process.argv[2]?.trim();
if (!customerId) {
  console.error("usage: node portal-test-customer-audit-production.mjs <customerId>");
  process.exit(1);
}

config({ path: resolve(process.cwd(), "backend/.env") });

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const mysqlVars = JSON.parse(
  execSync(`${npx} --yes @railway/cli variables --service MySQL --json`, { encoding: "utf8" }),
);
const publicUrl = new URL(mysqlVars.MYSQL_PUBLIC_URL);
publicUrl.pathname = "/wizfield";

const connection = await mysql.createConnection({
  host: publicUrl.hostname,
  port: Number(publicUrl.port || 3306),
  user: decodeURIComponent(publicUrl.username),
  password: decodeURIComponent(publicUrl.password),
  database: "wizfield",
});

const queries = {
  customer: "SELECT * FROM customers WHERE id = ? AND organization_id = ? LIMIT 1",
  jobs: "SELECT id, status, job_type, created_at, updated_at FROM jobs WHERE customer_id = ? AND organization_id = ?",
  invoices:
    "SELECT i.id, i.document_number, i.status, i.total_cents, i.amount_cents, i.created_at, i.job_id FROM invoices i INNER JOIN jobs j ON j.id = i.job_id WHERE j.customer_id = ? AND i.organization_id = ?",
  leads: "SELECT id, status, created_at FROM leads WHERE customer_id = ? AND organization_id = ?",
  quotes:
    "SELECT q.id, q.status, q.created_at, q.job_id FROM quotes q INNER JOIN jobs j ON j.id = q.job_id WHERE j.customer_id = ? AND q.organization_id = ?",
  portal_magic_links: "SELECT id, status, created_at, target_job_id FROM portal_magic_links WHERE customer_id = ? AND organization_id = ?",
  portal_sessions: "SELECT id, created_at, expires_at FROM portal_sessions WHERE customer_id = ? AND organization_id = ?",
  portal_access_events: "SELECT id, event_type, created_at FROM portal_access_events WHERE customer_id = ? AND organization_id = ? LIMIT 20",
  portal_identities: "SELECT id, status, primary_email_normalized FROM portal_identities WHERE customer_id = ?",
  txt_conversations: "SELECT id, public_conversation_code, created_at FROM txt_conversations WHERE customer_id = ? LIMIT 20",
};

try {
  const report = { customer_id: customerId, organization_id: PHOENIX_ORG_ID, tables: {} };
  for (const [key, sql] of Object.entries(queries)) {
    const params =
      sql.includes("portal_identities") && !sql.includes("organization_id")
        ? [customerId]
        : [customerId, PHOENIX_ORG_ID];
    try {
      const [rows] = await connection.query(sql, params);
      report.tables[key] = rows;
    } catch (error) {
      report.tables[key] = { error: String(error?.message || error) };
    }
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await connection.end();
}
