/**
 * Traces the full owner session path: login → session → /api/customers
 * through both direct backend (4000) and frontend proxy (3000).
 */
import {
  PHOENIX_OWNER_EMAIL,
  PHOENIX_OWNER_PASSWORD,
} from "./phoenix-owner-credentials";

const BACKEND = process.env.PHOENIX_VERIFY_BASE_URL ?? "http://localhost:4000";
const FRONTEND = process.env.PHOENIX_VERIFY_FRONTEND_URL ?? "http://localhost:3000";
const OWNER_EMAIL = PHOENIX_OWNER_EMAIL;
const OWNER_PASSWORD = PHOENIX_OWNER_PASSWORD;
const ADMIN_EMAIL = process.env.WIZFIELD_ADMIN_EMAIL?.trim() || "admin@phoenixcrm.local";
const adminPassword = process.env.WIZFIELD_ADMIN_PASSWORD?.trim();
if (!adminPassword) {
  throw new Error("WIZFIELD_ADMIN_PASSWORD must be set to run phoenix-owner-session-trace.");
}
const ADMIN_PASSWORD = adminPassword;
const PHOENIX_FIREPLACE_ORG_ID = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";
const BOOTSTRAP_ORG_ID = "90137527-3fd0-435c-9032-358f7f670662";

type TraceResult = {
  label: string;
  loginStatus: number;
  sessionUser: string | null;
  activeOrgId: string | null;
  activeOrgSlug: string | null;
  activeOrgName: string | null;
  customersApiTotal: number | null;
  customersAggregateTotal: number | null;
  homeWidgetTotal: number | null;
  pass: boolean;
  error: string | null;
};

function extractSessionCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  return setCookieHeader
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("wizfield_session="))
    ?.split(";")[0] ?? null;
}

async function tracePath(label: string, baseUrl: string, email: string, password: string): Promise<TraceResult> {
  const result: TraceResult = {
    label,
    loginStatus: 0,
    sessionUser: null,
    activeOrgId: null,
    activeOrgSlug: null,
    activeOrgName: null,
    customersApiTotal: null,
    customersAggregateTotal: null,
    homeWidgetTotal: null,
    pass: false,
    error: null,
  };

  try {
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    result.loginStatus = loginResponse.status;

    const cookie = extractSessionCookie(loginResponse.headers.get("set-cookie"));
    if (!cookie) {
      result.error = "No session cookie";
      return result;
    }

    const authHeaders = { cookie, "content-type": "application/json" };

    const sessionResponse = await fetch(`${baseUrl}/api/auth/session`, { headers: authHeaders });
    const sessionBody = await sessionResponse.json();
    const session = sessionBody?.data ?? sessionBody;

    result.sessionUser = session?.user?.email ?? null;
    result.activeOrgId = session?.active_organization?.id ?? null;
    result.activeOrgSlug = session?.active_organization?.slug ?? null;
    result.activeOrgName = session?.active_organization?.name ?? null;

    const customersResponse = await fetch(`${baseUrl}/api/customers?page=1&pageSize=100`, { headers: authHeaders });
    const customersBody = await customersResponse.json();
    const customers = customersBody?.data ?? customersBody;

    result.customersApiTotal = customers?.pagination?.totalCount ?? customers?.total ?? null;
    result.customersAggregateTotal = customers?.aggregates?.totalCustomers ?? null;

    const homeResponse = await fetch(`${baseUrl}/api/ai/home/summary-widgets`, { headers: authHeaders });
    const homeBody = await homeResponse.json();
    const home = homeBody?.data ?? homeBody;
    result.homeWidgetTotal = home?.widgets?.customers?.count ?? home?.customers?.count ?? null;

    result.pass =
      result.activeOrgId === PHOENIX_FIREPLACE_ORG_ID
      && result.customersApiTotal === 591
      && result.customersAggregateTotal === 591;

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    return result;
  }
}

async function main() {
  const traces = await Promise.all([
    tracePath("owner→backend:4000", BACKEND, OWNER_EMAIL, OWNER_PASSWORD),
    tracePath("owner→frontend:3000", FRONTEND, OWNER_EMAIL, OWNER_PASSWORD),
    tracePath("admin→backend:4000", BACKEND, ADMIN_EMAIL, ADMIN_PASSWORD),
    tracePath("admin→frontend:3000", FRONTEND, ADMIN_EMAIL, ADMIN_PASSWORD),
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    expectedOrgId: PHOENIX_FIREPLACE_ORG_ID,
    bootstrapOrgId: BOOTSTRAP_ORG_ID,
    bootstrapCustomerCount: 67,
    phoenixFireplaceCustomerCount: 591,
    traces,
    diagnosis: {
      ownerGets591OnBackend: traces[0]?.pass ?? false,
      ownerGets591OnFrontend: traces[1]?.pass ?? false,
      adminGets67: traces[2]?.activeOrgId === BOOTSTRAP_ORG_ID && traces[2]?.customersApiTotal === 67,
      likelyWrongAccount: traces[2]?.customersApiTotal === 67 && !traces[0]?.pass,
    },
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.diagnosis.ownerGets591OnBackend) {
    process.exitCode = 1;
  }
}

void main().catch(console.error);
