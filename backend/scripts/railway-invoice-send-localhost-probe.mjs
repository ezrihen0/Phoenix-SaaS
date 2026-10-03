/**
 * Staff send-email against production backend on 127.0.0.1:8080 via Railway SSH (bypasses Vercel proxy).
 */
import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "backend/.env") });
config({ path: resolve(process.cwd(), ".env") });

const BASE = process.env.PHOENIX_VERIFY_BASE_URL?.trim() || "https://app.phoenixfireplace.ca";
const EMAIL = process.env.PHOENIX_OWNER_EMAIL?.trim();
const PASSWORD = process.env.PHOENIX_OWNER_PASSWORD?.trim();
const INVOICE_ID = process.env.E2E_INVOICE_ID?.trim() || "cc8e393a-b29f-41d2-a6b3-9188251ed596";

if (!EMAIL || !PASSWORD) {
  console.error(JSON.stringify({ ok: false, error: "PHOENIX_OWNER_EMAIL and PHOENIX_OWNER_PASSWORD required" }));
  process.exit(1);
}

const loginResponse = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const sessionCookie = (loginResponse.headers.get("set-cookie") ?? "")
  .split(",")
  .map((part) => part.trim())
  .find((part) => part.startsWith("wizfield_session="))
  ?.split(";")[0];

if (!sessionCookie) {
  console.log(JSON.stringify({ ok: false, login_status: loginResponse.status }));
  process.exit(1);
}

const remoteSource = `
import http from "node:http";
const t0 = Date.now();
const cookie = ${JSON.stringify(sessionCookie)};
const body = "{}";
const invoiceId = ${JSON.stringify(INVOICE_ID)};
const req = http.request(
  {
    hostname: "127.0.0.1",
    port: 8080,
    path: \`/api/invoices/\${invoiceId}/send-email\`,
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
    timeout: 90000,
  },
  (res) => {
    let data = "";
    res.on("data", (chunk) => { data += chunk; });
    res.on("end", () => {
      console.log(JSON.stringify({
        ok: res.statusCode >= 200 && res.statusCode < 300,
        login_status: ${loginResponse.status},
        send_status: res.statusCode,
        send_ms: Date.now() - t0,
        body_preview: data.slice(0, 600),
      }));
    });
  },
);
req.on("timeout", () => req.destroy(new Error("request_timeout")));
req.on("error", (err) => {
  console.log(JSON.stringify({ ok: false, error: err.message, send_ms: Date.now() - t0 }));
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
    maxBuffer: 10 * 1024 * 1024,
  },
);

process.stdout.write(result.stdout || "");
if (result.stderr) {
  const filtered = result.stderr
    .split("\n")
    .filter((line) => !line.includes("Using SSH key") && !line.includes("npm warn"))
    .join("\n");
  if (filtered.trim()) {
    process.stderr.write(filtered);
  }
}
process.exit(result.status ?? 1);
