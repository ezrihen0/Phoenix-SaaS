import { execSync } from "node:child_process";
import mysql from "mysql2/promise";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const j = JSON.parse(execSync(`${npx} --yes @railway/cli variables --service MySQL --json`, { encoding: "utf8" }));
const u = new URL(j.MYSQL_PUBLIC_URL);
u.pathname = "/wizfield";
const orgId = "8d5bc762-eb13-43e5-85a1-723477adb47c";
const c = await mysql.createConnection({
  host: u.hostname,
  port: u.port || 3306,
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: "wizfield",
});
const [rows] = await c.query(
  "SELECT COUNT(*) AS c FROM invoices WHERE organization_id = ? AND branding_snapshot_json LIKE ?",
  [orgId, "%workiz_historical_import%"],
);
const [cust] = await c.query("SELECT COUNT(*) AS c FROM customers WHERE organization_id = ?", [orgId]);
const [jobs] = await c.query("SELECT COUNT(*) AS c FROM jobs WHERE organization_id = ?", [orgId]);
console.log(JSON.stringify({ workizHistoricalInvoices: rows[0].c, customers: cust[0].c, jobs: jobs[0].c }));
await c.end();
