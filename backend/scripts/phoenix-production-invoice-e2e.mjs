/**
 * Controlled production E2E: staff send → portal redeem → PDF → resend.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "backend/.env") });
config({ path: resolve(process.cwd(), ".env") });

const BASE = process.env.PHOENIX_VERIFY_BASE_URL?.trim() || "https://app.phoenixfireplace.ca";
const EMAIL = process.env.PHOENIX_OWNER_EMAIL?.trim();
const PASSWORD = process.env.PHOENIX_OWNER_PASSWORD?.trim();
const INVOICE_ID = process.env.E2E_INVOICE_ID?.trim() || "cc8e393a-b29f-41d2-a6b3-9188251ed596";

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
}

function parseSessionCookie(setCookieHeader) {
  return (setCookieHeader ?? "")
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("wizfield_session="))
    ?.split(";")[0];
}

function parsePortalCookie(setCookieHeader) {
  return (setCookieHeader ?? "")
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("wizfield_portal_session="))
    ?.split(";")[0];
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    throw new Error("PHOENIX_OWNER_EMAIL and PHOENIX_OWNER_PASSWORD required in backend/.env");
  }

  const loginResponse = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  record("staff_login", loginResponse.status === 200 || loginResponse.status === 201, loginResponse.status);

  const sessionCookie = parseSessionCookie(loginResponse.headers.get("set-cookie"));
  if (!sessionCookie) {
    console.log(JSON.stringify({ ok: false, checks }, null, 2));
    process.exit(1);
  }

  const authHeaders = { cookie: sessionCookie, "content-type": "application/json" };

  const invoiceResponse = await fetch(`${BASE}/api/invoices/${INVOICE_ID}`, { headers: authHeaders });
  const invoiceBody = await invoiceResponse.json().catch(() => null);
  const customerId =
    invoiceBody?.data?.customer?.id
    ?? invoiceBody?.data?.job?.customer?.id
    ?? invoiceBody?.data?.customer_id
    ?? null;
  const totalBefore = invoiceBody?.data?.total_cents ?? null;
  record("open_existing_invoice", invoiceResponse.status === 200 && Boolean(customerId), {
    status: invoiceResponse.status,
    customer_id: customerId,
    total_cents: totalBefore,
  });
  if (!customerId) {
    console.log(JSON.stringify({ ok: false, checks }, null, 2));
    process.exit(1);
  }

  const jobId = invoiceBody?.data?.job?.id ?? invoiceBody?.data?.job_id ?? null;

  const sendResponse = await fetch(`${BASE}/api/invoices/${INVOICE_ID}/send-email`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({}),
  });
  const sendBody = await sendResponse.json().catch(() => null);
  record("staff_send_invoice_email", sendResponse.status === 200 || sendResponse.status === 201, {
    status: sendResponse.status,
    message_id: sendBody?.data?.message_id ?? null,
    portal_host: process.env.CUSTOMER_PORTAL_BASE_URL ?? "https://portal.phoenixfireplace.ca",
  });

  const mintResponse = await fetch(`${BASE}/api/portal/staff/customers/${customerId}/magic-links`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(jobId ? { target_job_id: jobId } : {}),
  });
  const mintBody = await mintResponse.json().catch(() => null);
  const rawToken = mintBody?.data?.raw_token?.trim() ?? "";
  record("staff_mint_portal_link", mintResponse.status === 200 || mintResponse.status === 201, {
    status: mintResponse.status,
    has_raw_token: Boolean(rawToken),
  });

  const redeemResponse = await fetch(`${BASE}/api/portal/magic-links/redeem`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: rawToken }),
  });
  const portalCookie = parsePortalCookie(redeemResponse.headers.get("set-cookie"));
  const redeemBody = await redeemResponse.json().catch(() => null);
  record("portal_redeem_magic_link", redeemResponse.status === 200 || redeemResponse.status === 201, {
    status: redeemResponse.status,
    redirect: redeemBody?.data?.redirect_path ?? null,
  });

  const pdfResponse = await fetch(`${BASE}/api/portal/invoices/${INVOICE_ID}/pdf`, {
    headers: portalCookie ? { cookie: portalCookie } : {},
  });
  const pdfBytes = pdfResponse.ok ? (await pdfResponse.arrayBuffer()).byteLength : 0;
  record("portal_invoice_pdf_download", pdfResponse.status === 200 && pdfBytes > 500, {
    status: pdfResponse.status,
    bytes: pdfBytes,
    content_type: pdfResponse.headers.get("content-type"),
  });

  const resendResponse = await fetch(`${BASE}/api/invoices/${INVOICE_ID}/send-email`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ subject: "Phoenix cutover resend verification" }),
  });
  record("staff_resend_invoice_email", resendResponse.status === 200 || resendResponse.status === 201, {
    status: resendResponse.status,
  });

  const invoiceAfter = await fetch(`${BASE}/api/invoices/${INVOICE_ID}`, { headers: authHeaders });
  const invoiceAfterBody = await invoiceAfter.json().catch(() => null);
  const totalAfter = invoiceAfterBody?.data?.total_cents ?? null;
  record("invoice_totals_unchanged_after_send", totalBefore === totalAfter, {
    total_before: totalBefore,
    total_after: totalAfter,
  });

  const ok = checks.every((check) => check.ok);
  console.log(JSON.stringify({ ok, checks, invoice_id: INVOICE_ID }, null, 2));
  if (!ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error.message || error) }));
  process.exit(1);
});
