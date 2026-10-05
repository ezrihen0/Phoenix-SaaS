/**
 * Retry Michael report failed imports on Phoenix production after payload resolution.
 */
import { config } from "dotenv";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import mysql from "mysql2/promise";

config({ path: resolve(process.cwd(), "backend/.env") });

const BASE = "https://app.phoenixfireplace.ca";
const BATCH_ID = "da410a3f-658b-4c8a-8c9f-7baba6b06da6";
const PHOENIX_ORG_ID = "8d5bc762-eb13-43e5-85a1-723477adb47c";
const EMAIL = process.env.PHOENIX_OWNER_EMAIL?.trim();
const PASSWORD = process.env.PHOENIX_OWNER_PASSWORD?.trim();

function parseSessionCookie(setCookieHeader) {
  return (setCookieHeader ?? "")
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("wizfield_session="))
    ?.split(";")[0];
}

function connectProduction() {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const railwayJson = execSync(`${npx} --yes @railway/cli variables --service MySQL --json`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  const mysqlVars = JSON.parse(railwayJson);
  const publicUrl = new URL(mysqlVars.MYSQL_PUBLIC_URL);
  publicUrl.pathname = "/wizfield";
  return mysql.createConnection({
    host: publicUrl.hostname,
    port: Number(publicUrl.port || 3306),
    user: decodeURIComponent(publicUrl.username),
    password: decodeURIComponent(publicUrl.password),
    database: "wizfield",
  });
}

async function linkDuplicateAmirEntries(connection) {
  const [rows] = await connection.query(
    `SELECT id, payload_json, status FROM phoenix_field_historical_report_entries
     WHERE batch_id = ? AND organization_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.customerName')) = 'Amir Shah'`,
    [BATCH_ID, PHOENIX_ORG_ID],
  );

  const [existing] = await connection.query(
    `SELECT id FROM customers WHERE organization_id = ? AND LOWER(email) = ? LIMIT 1`,
    [PHOENIX_ORG_ID, "amir@gravityeng.com"],
  );

  if (existing.length === 0) {
    return { linked: false };
  }

  const customerId = existing[0].id;
  for (const row of rows) {
    if (row.status === "imported") {
      continue;
    }
    const payload = typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json;
    payload.customerId = customerId;
    payload.createNewCustomer = false;
    await connection.query(
      `UPDATE phoenix_field_historical_report_entries SET payload_json = ? WHERE id = ?`,
      [JSON.stringify(payload), row.id],
    );
  }

  return { linked: true, customerId };
}

async function retryImports(sessionCookie) {
  const response = await fetch(`${BASE}/api/phoenix-field-report/batches/${BATCH_ID}/retry-failed-imports`, {
    method: "POST",
    headers: { cookie: sessionCookie, "content-type": "application/json" },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    throw new Error("PHOENIX_OWNER_EMAIL and PHOENIX_OWNER_PASSWORD required");
  }

  const loginResponse = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const sessionCookie = parseSessionCookie(loginResponse.headers.get("set-cookie"));
  if (!sessionCookie) {
    throw new Error(`Login failed: ${loginResponse.status}`);
  }

  const connection = await connectProduction();
  try {
    let attempt = await retryImports(sessionCookie);
    let linkResult = await linkDuplicateAmirEntries(connection);
    if (linkResult.linked) {
      attempt = await retryImports(sessionCookie);
    }

    const draftResponse = await fetch(`${BASE}/api/phoenix-field-report/draft`, {
      headers: { cookie: sessionCookie },
    });
    const draft = await draftResponse.json();

    const entries = draft?.data?.entries ?? [];
    const summary = {
      importStatus: draft?.data?.importStatus,
      imported: entries.filter((entry) => entry.status === "imported").length,
      failed: entries.filter((entry) => entry.status === "failed").length,
      duplicateBlocked: entries.filter((entry) => entry.status === "duplicate_blocked").length,
      failedEntries: entries
        .filter((entry) => entry.status === "failed" || entry.status === "duplicate_blocked")
        .map((entry) => ({
          id: entry.id,
          customerName: entry.payload?.customerName,
          status: entry.status,
          lastErrorCode: entry.lastErrorCode,
          lastErrorMessage: entry.lastErrorMessage,
        })),
      successfulEntries: entries
        .filter((entry) => entry.status === "imported")
        .map((entry) => ({
          id: entry.id,
          customerName: entry.payload?.customerName,
          customerId: entry.customerId,
          jobId: entry.jobId,
          invoiceId: entry.invoiceId,
          paymentId: entry.paymentId,
        })),
      retryAttempt: attempt,
      amirLinkPass: linkResult,
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await connection.end();
  }
}

void main();
