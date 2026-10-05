/**
 * BLOCKER gate: portal.phoenixfireplace.ca must serve website portal routes (magic confirm + invoice deep-link).
 */
const PORTAL =
  process.env.PHOENIX_PORTAL_VERIFY_BASE_URL?.trim() || "https://portal.phoenixfireplace.ca";
const APP = process.env.PHOENIX_VERIFY_BASE_URL?.trim() || "https://app.phoenixfireplace.ca";

const LEGACY_TOKEN = "0000000000000000000000000000000000000000000000000000000000000001";

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
  const magicProbe = await fetchText(`${PORTAL}/portal/auth/magic?token=${encodeURIComponent(LEGACY_TOKEN)}`);
  record("portal_magic_confirm_route_not_host_404", magicProbe.response.status !== 404, {
    status: magicProbe.response.status,
    content_type: magicProbe.response.headers.get("content-type"),
  });
  record("portal_magic_confirm_shell", magicProbe.text.includes("Confirm sign-in"), {
    matched: magicProbe.text.includes("Confirm sign-in"),
  });

  const accessProbe = await fetchText(`${PORTAL}/access/${LEGACY_TOKEN}`, { redirect: "manual" });
  const accessLocation = accessProbe.response.headers.get("location") ?? "";
  record("portal_legacy_access_not_host_404", accessProbe.response.status !== 404, {
    status: accessProbe.response.status,
  });
  record("portal_legacy_access_redirects_to_magic", accessLocation.includes("/portal/auth/magic?token="), {
    status: accessProbe.response.status,
    location: accessLocation,
  });

  const invoiceProbe = await fetchText(`${PORTAL}/portal/invoices/00000000-0000-4000-8000-000000000001`, {
    redirect: "manual",
  });
  const invoiceLocation = invoiceProbe.response.headers.get("location") ?? "";
  record("portal_invoice_route_not_host_404", invoiceProbe.response.status !== 404, {
    status: invoiceProbe.response.status,
  });
  record("portal_invoice_requires_session", invoiceProbe.response.status === 307 && invoiceLocation.includes("/portal/login"), {
    status: invoiceProbe.response.status,
    location: invoiceLocation,
  });

  const rootProbe = await fetchText(`${PORTAL}/`, { redirect: "manual" });
  const location = rootProbe.response.headers.get("location");
  record("portal_root_not_legacy_login", !rootProbe.text.includes("Customer portal login"), {
    status: rootProbe.response.status,
    location,
  });

  const appAccess = await fetchText(`${APP}/access/${LEGACY_TOKEN}`, { redirect: "manual" });
  const appLocation = appAccess.response.headers.get("location") ?? "";
  record("app_legacy_access_redirects_to_portal_magic", appLocation.includes("/portal/auth/magic?token="), {
    status: appAccess.response.status,
    location: appLocation,
  });

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
