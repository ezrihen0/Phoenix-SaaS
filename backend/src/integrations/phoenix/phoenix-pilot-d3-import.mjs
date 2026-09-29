import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const payloadFile = join(__dirname, "phoenix-pilot-d3-payload.json");
const dryRun = process.env.DRY_RUN?.trim() !== "false";

const file = JSON.parse(readFileSync(payloadFile, "utf8"));
const body = {
  organizationId: file.organizationId,
  importBatch: file.importBatch,
  dryRun,
  records: file.customers,
};

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
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

const orgId = encodeURIComponent(file.organizationId);
const exportRes = await request("GET", `/api/integrations/phoenix/customers/export?organizationId=${orgId}`);
const importRes = await request("POST", "/api/integrations/phoenix/customers/import", body);

let exportJson;
let importJson;
try {
  exportJson = JSON.parse(exportRes.text);
} catch {
  exportJson = { parseError: true, raw: exportRes.text };
}

try {
  importJson = JSON.parse(importRes.text);
} catch {
  importJson = { parseError: true, raw: importRes.text };
}

const customersBefore = exportJson?.data?.customers || [];
const summary = importJson?.data?.summary || null;

process.stdout.write(
  `${JSON.stringify(
    {
      dryRun,
      phoenixCustomerCountBefore: customersBefore.length,
      exportStatus: exportRes.status,
      importStatus: importRes.status,
      importSummary: summary,
      importResults: importJson?.data?.results || null,
      importError: importJson?.error || null,
    },
    null,
    2,
  )}\n`,
);

if (importRes.status !== 200 && importRes.status !== 201) {
  process.exit(1);
}
