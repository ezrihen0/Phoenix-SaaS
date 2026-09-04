import {
  PHOENIX_OWNER_EMAIL,
  PHOENIX_OWNER_PASSWORD,
} from "./phoenix-owner-credentials";

const BASE = process.env.PHOENIX_VERIFY_BASE_URL ?? "http://localhost:4000";
const EMAIL = PHOENIX_OWNER_EMAIL;
const PASSWORD = PHOENIX_OWNER_PASSWORD;
const ORG_SLUG = process.env.PHOENIX_ORG_SLUG ?? "phoenix-fireplace";

type Check = { name: string; ok: boolean; detail: unknown };

const checks: Check[] = [];

function record(name: string, ok: boolean, detail: unknown) {
  checks.push({ name, ok, detail });
}

async function main() {
  const loginResponse = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  const loginBody = await loginResponse.json();
  record("login_status", loginResponse.status === 200 || loginResponse.status === 201, loginResponse.status);

  const cookieHeader = loginResponse.headers.get("set-cookie") ?? "";
  const sessionCookie = cookieHeader
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("wizfield_session="))
    ?.split(";")[0];

  if (!sessionCookie) {
    record("session_cookie", false, cookieHeader);
    console.log(JSON.stringify({ ok: false, checks }, null, 2));
    process.exitCode = 1;
    return;
  }

  record("session_cookie", true, "present");

  const authHeaders = {
    cookie: sessionCookie,
    "content-type": "application/json",
  };

  const destinationResponse = await fetch(`${BASE}/api/auth/destination`, { headers: authHeaders });
  const destinationBody = await destinationResponse.json();
  record("destination_home", destinationBody?.data?.destination === "/home", destinationBody?.data ?? destinationBody);

  const sessionResponse = await fetch(`${BASE}/api/auth/session`, { headers: authHeaders });
  const sessionBody = await sessionResponse.json();
  const activeOrg = sessionBody?.data?.active_organization ?? sessionBody?.active_organization ?? null;
  record("session_active_org", Boolean(activeOrg?.slug === ORG_SLUG && activeOrg?.name === "Phoenix Fireplace"), activeOrg);

  const dashboardResponse = await fetch(`${BASE}/api/dashboard`, { headers: authHeaders });
  const dashboardBody = await dashboardResponse.json().catch(() => null);
  record("crm_dashboard", dashboardResponse.status === 200, {
    status: dashboardResponse.status,
    code: dashboardBody?.error?.code ?? null,
  });

  const leadsResponse = await fetch(`${BASE}/api/leads`, { headers: authHeaders });
  record("crm_leads", leadsResponse.status === 200, { status: leadsResponse.status });

  const bookingResponse = await fetch(`${BASE}/api/public/orgs/${ORG_SLUG}/bookings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source: "website",
      fullName: "Phoenix Activation Verify",
      phone: "5551112222",
      email: "verify@phoenixfireplace.com",
      serviceAddressLine1: "123 Chimney Lane",
      serviceAddressLine2: null,
      serviceCity: "Phoenix",
      serviceStateOrRegion: "AZ",
      servicePostalCode: "85001",
      serviceType: "inspection",
      description: "Activation verification booking",
    }),
  });
  const bookingBody = await bookingResponse.json().catch(() => null);
  record("public_booking", bookingResponse.status === 200 || bookingResponse.status === 201, {
    status: bookingResponse.status,
    leadId: bookingBody?.data?.leadId ?? bookingBody?.leadId ?? null,
  });

  const ok = checks.every((check) => check.ok);
  console.log(JSON.stringify({ ok, checks }, null, 2));
  if (!ok) process.exitCode = 1;
}

void main();
