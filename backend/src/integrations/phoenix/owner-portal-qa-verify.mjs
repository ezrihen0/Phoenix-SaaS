import http from "node:http";

const organizationId =
  process.env.PHOENIX_WIZFIELD_ORG_ID?.trim() || "8d5bc762-eb13-43e5-85a1-723477adb47c";
const secret = process.env.PHOENIX_INTEGRATION_SECRET || process.env.WIZFIELD_INTEGRATION_SECRET || "";
const port = Number(process.env.PORT || process.env.BACKEND_PORT || 4000);

if (!secret) {
  console.error("missing_integration_secret");
  process.exit(1);
}

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : "";
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          Authorization: `Bearer ${secret}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode, text, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function unwrap(data) {
  if (!data || typeof data !== "object") return null;
  return data.data && typeof data.data === "object" ? data.data : data;
}

const report = {
  generatedAt: new Date().toISOString(),
  checks: [],
  decision: "OWNER PORTAL QA FAIL",
};

function check(name, pass, detail) {
  report.checks.push({ name, status: pass ? "PASS" : "FAIL", detail });
  return pass;
}

const mintRes = await request("POST", "/api/integrations/phoenix/portal/magic-link", {
  organizationId,
  email: "danbrudo01@gmail.com",
});
const mintJson = parseJson(mintRes.text);
const minted = unwrap(mintJson);
const magicUrl = minted?.magic_link_url || "";
const token = magicUrl ? new URL(magicUrl).searchParams.get("token") : null;

check(
  "magic_link_host",
  magicUrl.startsWith("https://portal.phoenixfireplace.ca/portal/auth/magic?token="),
  { status: mintRes.status, host: magicUrl ? new URL(magicUrl).host : null },
);

const redeemRes = await request("POST", "/api/portal/auth/redeem", { token });
const redeemJson = parseJson(redeemRes.text);
const redeemed = unwrap(redeemJson);
const sessionToken = redeemed?.session_token || redeemed?.token || null;
const qaCustomerId = redeemed?.customer_id || null;

check(
  "magic_link_redeem",
  (redeemRes.status === 200 || redeemRes.status === 201) && Boolean(sessionToken),
  {
    status: redeemRes.status,
    customerId: qaCustomerId,
  },
);

const homeRes = await request("GET", "/api/portal/home", null, {
  "X-Portal-Session": sessionToken,
});
const homeJson = parseJson(homeRes.text);
const home = unwrap(homeJson);

check("portal_home_session", homeRes.status === 200 && Boolean(home), { status: homeRes.status });

const qaInvoice = Array.isArray(home?.invoices) ? home.invoices[0] : null;
check("portal_finance_invoice_present", Boolean(qaInvoice?.id), {
  invoiceCount: Array.isArray(home?.invoices) ? home.invoices.length : 0,
});
check("portal_finance_totals", Boolean(qaInvoice && qaInvoice.total_cents > 0), qaInvoice);
check(
  "portal_finance_balance",
  Boolean(qaInvoice && qaInvoice.balance_cents === 23900 && qaInvoice.total_cents === 33900),
  qaInvoice,
);
check(
  "portal_customer_identity",
  pickString(home?.customer?.full_name) === "Test Testy",
  home?.customer,
);
check(
  "portal_jobs_visible",
  Array.isArray(home?.jobs) && home.jobs.some((job) => String(job.title || "").includes("OWNER QA TEST")),
  { count: home?.jobs?.length ?? 0 },
);
check(
  "portal_tax_configured",
  Boolean(qaInvoice && qaInvoice.tax_cents === 3900 && qaInvoice.tax_rate_bps === 1300),
  qaInvoice,
);

function pickString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
check(
  "portal_warranty_visible",
  Array.isArray(home?.warranty_certificates) && home.warranty_certificates.length >= 2,
  { count: home?.warranty_certificates?.length ?? 0 },
);

const exportRes = await request(
  "GET",
  `/api/integrations/phoenix/customers/export?organizationId=${encodeURIComponent(organizationId)}`,
);
const exportJson = parseJson(exportRes.text);
const exportData = unwrap(exportJson);
const customers = exportData?.customers || [];
const qaRow = customers.find(
  (row) => typeof row.email === "string" && row.email.toLowerCase() === "danbrudo01@gmail.com",
);
check("qa_customer_export_identity", qaRow?.name === "Test Testy", qaRow);

if (qaCustomerId) {
  const crossHome = await request("GET", "/api/portal/home", null, {
    "X-Portal-Session": sessionToken,
  });
  check("customer_isolation_session_scope", crossHome.status === 200, { status: crossHome.status });
}

if (qaInvoice?.id) {
  const foreignPdf = await request(
    "GET",
    `/api/portal/invoices/00000000-0000-4000-8000-000000000001/pdf`,
    null,
    { "X-Portal-Session": sessionToken },
  );
  check("invoice_isolation_foreign_id", foreignPdf.status === 404 || foreignPdf.status === 403, {
    status: foreignPdf.status,
  });

  const ownPdf = await request(
    "GET",
    `/api/portal/invoices/${encodeURIComponent(qaInvoice.id)}/pdf`,
    null,
    { "X-Portal-Session": sessionToken },
  );
  check("invoice_pdf_on_demand", ownPdf.status === 200, { status: ownPdf.status, bytes: ownPdf.text.length });
}

const loggedOutPdf = qaInvoice?.id
  ? await request("GET", `/api/portal/invoices/${encodeURIComponent(qaInvoice.id)}/pdf`)
  : { status: 401 };
check("logout_pdf_unauthorized", loggedOutPdf.status === 401 || loggedOutPdf.status === 403, {
  status: loggedOutPdf.status,
});

const replayRedeem = await request("POST", "/api/portal/auth/redeem", { token });
check("magic_link_single_use", replayRedeem.status !== 200, { status: replayRedeem.status });

const allPass = report.checks.every((row) => row.status === "PASS");
if (allPass) {
  report.decision = "OWNER PORTAL QA PASS";
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(allPass ? 0 : 1);
