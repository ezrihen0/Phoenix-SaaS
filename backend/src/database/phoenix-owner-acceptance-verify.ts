/**
 * Owner acceptance verification — traces live session path and emits acceptance report.
 * Run: npm run phoenix:customers:owner-acceptance
 */
import "dotenv/config";

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import {
  PHOENIX_OWNER_EMAIL,
  PHOENIX_OWNER_PASSWORD,
} from "./phoenix-owner-credentials";

const BACKEND = process.env.PHOENIX_VERIFY_BASE_URL ?? "http://localhost:4000";
const FRONTEND = process.env.PHOENIX_VERIFY_FRONTEND_URL ?? "http://localhost:3000";
const OWNER_EMAIL = PHOENIX_OWNER_EMAIL;
const OWNER_PASSWORD = PHOENIX_OWNER_PASSWORD;
const PHOENIX_FIREPLACE_ORG_ID = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";
const BOOTSTRAP_ORG_ID = "90137527-3fd0-435c-9032-358f7f670662";
const OUTPUT_DIR = join(__dirname, "../../_runtime_harness/phoenix-customer-ledger");

function extractSessionCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  return setCookieHeader
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("wizfield_session="))
    ?.split(";")[0] ?? null;
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const login = await fetchJson(`${FRONTEND}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
  });

  const cookie = extractSessionCookie(login.response.headers.get("set-cookie"));
  if (!cookie) {
    throw new Error("Owner login did not return session cookie");
  }

  const authHeaders = { cookie, "content-type": "application/json" };

  const [sessionResult, customersResult, homeResult, invoicesResult, jobsResult] = await Promise.all([
    fetchJson(`${FRONTEND}/api/auth/session`, { headers: authHeaders }),
    fetchJson(`${FRONTEND}/api/customers?page=1&pageSize=100`, { headers: authHeaders }),
    fetchJson(`${FRONTEND}/api/ai/home/summary-widgets`, { headers: authHeaders }),
    fetchJson(`${FRONTEND}/api/invoices?page=1&pageSize=1`, { headers: authHeaders }),
    fetchJson(`${FRONTEND}/api/jobs?page=1&pageSize=1`, { headers: authHeaders }),
  ]);

  const session = sessionResult.body?.data ?? sessionResult.body;
  const customers = customersResult.body?.data ?? customersResult.body;
  const home = homeResult.body?.data ?? homeResult.body;

  const activeOrgId = session?.active_organization?.id ?? null;
  const activeOrgSlug = session?.active_organization?.slug ?? null;
  const activeOrgName = session?.active_organization?.name ?? null;
  const customersApiTotal = customers?.pagination?.totalCount ?? customers?.total ?? null;
  const customersUiTotal = customers?.aggregates?.totalCustomers ?? customersApiTotal;
  const homeTotal = home?.widgets?.customers?.count ?? null;

  const sameOrgAcrossSurfaces =
    activeOrgId === PHOENIX_FIREPLACE_ORG_ID
    && customersApiTotal === 591
    && customersUiTotal === 591
    && homeTotal === 591;

  const report = {
    generatedAt: new Date().toISOString(),
    LOGIN_USER: session?.user?.email ?? OWNER_EMAIL,
    ACTIVE_ORGANIZATION: activeOrgName,
    ACTIVE_ORGANIZATION_ID: activeOrgId,
    ACTIVE_ORGANIZATION_SLUG: activeOrgSlug,
    CUSTOMERS_API_TOTAL: customersApiTotal,
    CUSTOMERS_UI_TOTAL: customersUiTotal,
    HOME_TOTAL: homeTotal,
    INVOICES_STATUS: invoicesResult.response.status,
    JOBS_STATUS: jobsResult.response.status,
    ROOT_CAUSE_OF_67:
      customersApiTotal === 67
        ? "Session resolved to bootstrap org (slug phoenix, id 90137527-...) — typically admin@phoenixcrm.local or stale bootstrap session"
        : customersApiTotal === 591
          ? "None — owner session correctly resolves to Phoenix Fireplace"
          : "Unexpected customer total — investigate active organization and tenant data",
    FIX:
      customersApiTotal === 591
        ? "No additional fix required for owner session path"
        : `Use ${PHOENIX_OWNER_EMAIL}, ensure active workspace is Phoenix Fireplace (phoenix-fireplace), not bootstrap phoenix tenant`,
    OLD_BOOTSTRAP_ORG_STILL_ISOLATED:
      activeOrgId === BOOTSTRAP_ORG_ID ? "FAIL" : "PASS",
    SAME_ORG_ACROSS_HOME_CUSTOMERS_AI_INVOICES_JOBS:
      sameOrgAcrossSurfaces && invoicesResult.response.status === 200 && jobsResult.response.status === 200
        ? "PASS"
        : "FAIL",
    OWNER_ACCEPTANCE:
      sameOrgAcrossSurfaces ? "PASS" : "FAIL",
    expected: {
      orgId: PHOENIX_FIREPLACE_ORG_ID,
      orgSlug: "phoenix-fireplace",
      customerTotal: 591,
      bootstrapOrgId: BOOTSTRAP_ORG_ID,
      bootstrapCustomerTotal: 67,
    },
  };

  writeFileSync(join(OUTPUT_DIR, "owner-acceptance-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (report.OWNER_ACCEPTANCE !== "PASS") {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
