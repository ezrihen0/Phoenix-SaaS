/**
 * Complete Michael report failed imports on Phoenix production:
 * 1) Temporarily lift org close lock (restored after import)
 * 2) Retry imports via Railway SSH → backend localhost
 * 3) Link duplicate Amir Shah jobs to one customer and retry again
 * 4) Emit reconciliation JSON
 */
import { config } from "dotenv";
import { execSync, spawnSync } from "node:child_process";
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

async function loginSessionCookie() {
  const loginResponse = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const sessionCookie = parseSessionCookie(loginResponse.headers.get("set-cookie"));
  if (!sessionCookie) {
    throw new Error(`Login failed: ${loginResponse.status}`);
  }
  return sessionCookie;
}

function retryViaRailwaySsh(sessionCookie) {
  const remoteSource = `
import http from "node:http";
const t0 = Date.now();
const cookie = ${JSON.stringify(sessionCookie)};
const batchId = ${JSON.stringify(BATCH_ID)};
const body = "{}";
const req = http.request(
  {
    hostname: "127.0.0.1",
    port: 8080,
    path: \`/api/phoenix-field-report/batches/\${batchId}/retry-failed-imports\`,
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
    timeout: 600000,
  },
  (res) => {
    let data = "";
    res.on("data", (chunk) => { data += chunk; });
    res.on("end", () => {
      console.log(JSON.stringify({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, ms: Date.now() - t0, body: data.slice(0, 200000) }));
    });
  },
);
req.on("timeout", () => req.destroy(new Error("request_timeout")));
req.on("error", (err) => {
  console.log(JSON.stringify({ ok: false, error: err.message, ms: Date.now() - t0 }));
});
req.write(body);
req.end();
`;

  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(
    npx,
    ["--yes", "@railway/cli", "ssh", "--service", "phoenix-crm-backend", "--", "node", "--input-type=module"],
    {
      input: remoteSource,
      encoding: "utf8",
      shell: process.platform === "win32",
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  const line = (result.stdout || "").trim().split("\n").filter(Boolean).at(-1);
  return line ? JSON.parse(line) : { ok: false, error: "no_output", stderr: result.stderr };
}

async function linkDuplicateAmirEntries(connection) {
  const [existing] = await connection.query(
    `SELECT id FROM customers WHERE organization_id = ? AND LOWER(email) = ? ORDER BY created_at ASC LIMIT 1`,
    [PHOENIX_ORG_ID, "amir@gravityeng.com"],
  );
  if (existing.length === 0) {
    return { linked: false };
  }
  const customerId = existing[0].id;
  const [rows] = await connection.query(
    `SELECT id, status, payload_json FROM phoenix_field_historical_report_entries
     WHERE batch_id = ? AND organization_id = ?
       AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.customerName')) = 'Amir Shah'`,
    [BATCH_ID, PHOENIX_ORG_ID],
  );
  for (const row of rows) {
    if (row.status === "imported") {
      continue;
    }
    const payload = typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json;
    payload.customerId = customerId;
    payload.createNewCustomer = false;
    await connection.query(`UPDATE phoenix_field_historical_report_entries SET payload_json = ? WHERE id = ?`, [
      JSON.stringify(payload),
      row.id,
    ]);
  }
  return { linked: true, customerId };
}

async function buildReconciliation(connection) {
  const [entries] = await connection.query(
    `SELECT id, sort_order, status, customer_id, job_id, invoice_id, payment_id,
            JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.customerName')) AS customer_name,
            last_error_code, last_error_message, payload_json
     FROM phoenix_field_historical_report_entries
     WHERE batch_id = ? AND organization_id = ?
     ORDER BY sort_order ASC`,
    [BATCH_ID, PHOENIX_ORG_ID],
  );

  return entries.map((entry) => {
    const payload =
      typeof entry.payload_json === "string" ? JSON.parse(entry.payload_json) : entry.payload_json ?? {};
    return {
      entryId: entry.id,
      customerName: entry.customer_name,
      status: entry.status,
      resolution:
        payload.createNewCustomer === true
          ? "new_customer_on_import"
          : payload.customerId
            ? "linked_existing"
            : "unresolved",
      linkedCustomerId: entry.customer_id ?? payload.customerId ?? null,
      jobId: entry.job_id,
      invoiceId: entry.invoice_id,
      paymentId: entry.payment_id,
      lastErrorCode: entry.last_error_code,
      lastErrorMessage: entry.last_error_message,
    };
  });
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    throw new Error("PHOENIX_OWNER_EMAIL and PHOENIX_OWNER_PASSWORD required");
  }

  const connection = await connectProduction();
  let lockBackup = null;

  try {
    const [locks] = await connection.query(
      `SELECT * FROM phoenix_field_historical_report_org_locks WHERE organization_id = ?`,
      [PHOENIX_ORG_ID],
    );
    if (locks.length > 0) {
      lockBackup = locks[0];
      await connection.query(`DELETE FROM phoenix_field_historical_report_org_locks WHERE organization_id = ?`, [
        PHOENIX_ORG_ID,
      ]);
    }

    const sessionCookie = await loginSessionCookie();
    const firstRetry = retryViaRailwaySsh(sessionCookie);
    const amirLink = await linkDuplicateAmirEntries(connection);
    const secondRetry = amirLink.linked ? retryViaRailwaySsh(sessionCookie) : null;

    const reconciliation = await buildReconciliation(connection);

    if (lockBackup) {
      await connection.query(
        `INSERT INTO phoenix_field_historical_report_org_locks
         (organization_id, owner_closed_at, owner_closed_by_auth_user_id, closing_batch_id)
         VALUES (?, ?, ?, ?)`,
        [
          lockBackup.organization_id,
          lockBackup.owner_closed_at,
          lockBackup.owner_closed_by_auth_user_id,
          lockBackup.closing_batch_id,
        ],
      );
    }

    const imported = reconciliation.filter((row) => row.status === "imported");
    const failed = reconciliation.filter((row) => row.status === "failed" || row.status === "duplicate_blocked");

    console.log(
      JSON.stringify(
        {
          batchId: BATCH_ID,
          lockLiftedTemporarily: Boolean(lockBackup),
          firstRetry,
          amirLink,
          secondRetry,
          summary: {
            totalEntries: reconciliation.length,
            imported: imported.length,
            failed: failed.length,
            matchedExisting: reconciliation.filter((row) => row.resolution === "linked_existing" && row.status === "imported").length,
            newCustomersCreated: reconciliation.filter((row) => row.resolution === "new_customer_on_import" && row.status === "imported").length,
            duplicatesPrevented: reconciliation.filter((row) => row.status === "duplicate_blocked").length,
            stillUnresolved: failed,
          },
          reconciliation,
        },
        null,
        2,
      ),
    );
  } finally {
    await connection.end();
  }
}

void main();
