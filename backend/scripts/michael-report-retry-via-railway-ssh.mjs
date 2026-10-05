/**
 * Retry Michael report imports via Railway SSH → production backend localhost (bypasses Vercel).
 */
import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "backend/.env") });

const BASE = "https://app.phoenixfireplace.ca";
const BATCH_ID = "da410a3f-658b-4c8a-8c9f-7baba6b06da6";
const EMAIL = process.env.PHOENIX_OWNER_EMAIL?.trim();
const PASSWORD = process.env.PHOENIX_OWNER_PASSWORD?.trim();

function parseSessionCookie(setCookieHeader) {
  return (setCookieHeader ?? "")
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("wizfield_session="))
    ?.split(";")[0];
}

const loginResponse = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const sessionCookie = parseSessionCookie(loginResponse.headers.get("set-cookie"));
if (!sessionCookie) {
  console.error(JSON.stringify({ ok: false, login_status: loginResponse.status }));
  process.exit(1);
}

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
      console.log(JSON.stringify({
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        ms: Date.now() - t0,
        body: data.slice(0, 120000),
      }));
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

process.stdout.write(result.stdout || "");
process.exit(result.status ?? 1);
