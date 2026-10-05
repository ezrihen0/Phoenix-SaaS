import { config } from "dotenv";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import mysql from "mysql2/promise";

config({ path: resolve(process.cwd(), "backend/.env") });

const PHOENIX_ORG_ID = "8d5bc762-eb13-43e5-85a1-723477adb47c";
const EMAIL = "zrihene1@gmail.com";

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

try {
  const [orgRows] = await connection.query(
    "SELECT id, name, slug FROM organizations WHERE id = ? LIMIT 1",
    [PHOENIX_ORG_ID],
  );
  const [customers] = await connection.query(
    `SELECT id, full_name, email, updated_at
     FROM customers
     WHERE organization_id = ? AND LOWER(TRIM(email)) = ?
     ORDER BY updated_at DESC`,
    [PHOENIX_ORG_ID, EMAIL],
  );
  const enriched = [];
  for (const customer of customers) {
    const [identities] = await connection.query(
      "SELECT id, status, primary_email_normalized FROM portal_identities WHERE customer_id = ?",
      [customer.id],
    );
    const [invoiceCount] = await connection.query(
      `SELECT COUNT(*) AS c FROM invoices i
       INNER JOIN jobs j ON j.id = i.job_id AND j.organization_id = i.organization_id
       WHERE j.customer_id = ? AND i.organization_id = ?`,
      [customer.id, PHOENIX_ORG_ID],
    );
    enriched.push({
      ...customer,
      portal_identities: identities,
      invoice_count: invoiceCount[0]?.c ?? 0,
    });
  }
  console.log(JSON.stringify({ organization: orgRows[0] ?? null, customers: enriched }, null, 2));
} finally {
  await connection.end();
}
