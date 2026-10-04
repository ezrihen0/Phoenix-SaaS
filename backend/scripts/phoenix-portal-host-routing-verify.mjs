/**
 * BLOCKER gate: portal.phoenixfireplace.ca must serve the same Next routes as app (access + portal invoice).
 */
const PORTAL =
  process.env.PHOENIX_PORTAL_VERIFY_BASE_URL?.trim() || "https://portal.phoenixfireplace.ca";
const APP = process.env.PHOENIX_VERIFY_BASE_URL?.trim() || "https://app.phoenixfireplace.ca";

const checks = [];

function record(name, ok, detail) {
  checks.push({ name, ok, detail });
}

async function fetchText(url, init) {
  const response = await fetch(url, init);
  const text = await response.text().catch(() => "");
  return { response, text };
}

async function main() {
  const accessProbe = await fetchText(`${PORTAL}/access/0000000000000000000000000000000000000000000000000000000000000001`);
  record("portal_access_route_not_host_404", accessProbe.response.status !== 404, {
    status: accessProbe.response.status,
    content_type: accessProbe.response.headers.get("content-type"),
  });
  record("portal_access_opens_redeem_shell", accessProbe.text.includes("Opening your customer portal"), {
    matched: accessProbe.text.includes("Opening your customer portal"),
  });
  record("portal_access_not_plaintext_download", !/^text\/plain\b/i.test(accessProbe.response.headers.get("content-type") ?? ""), {
    content_type: accessProbe.response.headers.get("content-type"),
  });

  const invoiceProbe = await fetchText(`${PORTAL}/portal/invoices/00000000-0000-4000-8000-000000000001`);
  record("portal_invoice_route_not_host_404", invoiceProbe.response.status !== 404, {
    status: invoiceProbe.response.status,
  });
  record("portal_invoice_next_shell", invoiceProbe.response.status === 200, {
    status: invoiceProbe.response.status,
    has_next: invoiceProbe.text.includes("__NEXT_DATA__") || invoiceProbe.text.includes("Loading invoice"),
  });

  const rootProbe = await fetchText(`${PORTAL}/`, { redirect: "manual" });
  const location = rootProbe.response.headers.get("location");
  record("portal_root_not_legacy_login", !rootProbe.text.includes("Customer portal login"), {
    status: rootProbe.response.status,
    location,
  });

  const appAccess = await fetchText(`${APP}/access/0000000000000000000000000000000000000000000000000000000000000001`);
  record("app_access_baseline_ok", appAccess.response.status === 200, { status: appAccess.response.status });

  const ok = checks.every((check) => check.ok);
  console.log(JSON.stringify({ ok, portal: PORTAL, app: APP, checks }, null, 2));
  if (!ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error.message || error) }));
  process.exit(1);
});
