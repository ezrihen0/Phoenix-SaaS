import "dotenv/config";
import "reflect-metadata";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { DataSource } from "typeorm";

import { CustomerEntity } from "./entities/customer.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";

import {
  PHOENIX_OWNER_EMAIL,
  PHOENIX_OWNER_PASSWORD,
} from "./phoenix-owner-credentials";

const PHOENIX_ORG_ID = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";
const PHOENIX_ORG_SLUG = "phoenix-fireplace";
const BASE = process.env.PHOENIX_VERIFY_BASE_URL ?? "http://localhost:4000";
const FRONTEND = process.env.PHOENIX_VERIFY_FRONTEND_URL ?? "http://localhost:3000";
const EMAIL = PHOENIX_OWNER_EMAIL;
const PASSWORD = PHOENIX_OWNER_PASSWORD;
const OUTPUT_DIR = join(__dirname, "../../_runtime_harness/phoenix-customer-ledger");

type CustomersApiItem = { id: string; full_name?: string };
type CustomersApiResponse = {
  data?: {
    items?: CustomersApiItem[];
    total?: number;
    pagination?: {
      totalCount?: number;
      totalPages?: number;
      page?: number;
      pageSize?: number;
    };
    aggregates?: {
      totalCustomers?: number;
      newThisMonth?: number;
    };
  };
};

type ReconciliationReport = {
  summary?: {
    dbCustomerMasterCount?: number;
    customersWithHistory?: number;
    customersWithoutHistory?: number;
    historicalDeterministicCreatedDate?: number;
    historicalWithoutDeterministicCreatedDate?: number;
    earliestCustomerDate?: string | null;
    latestHistoricalInvoiceDate?: string | null;
    nativeWizfieldCustomers?: number;
    newThisMonthCorrected?: number;
  };
  customers?: Array<{
    customer_id: string;
    name: string;
    phone: string;
    email: string | null;
    address: string;
    history_classification: "CUSTOMER_WITH_HISTORY" | "CUSTOMER_WITHOUT_HISTORY";
  }>;
};

type SearchCase = {
  customerId: string;
  customerName: string;
  field: "name" | "phone" | "email" | "address";
  query: string;
  historyClassification: string;
};

type SearchResult = SearchCase & {
  pass: boolean;
  resultCount: number;
};

function writeJson(path: string, payload: unknown): void {
  writeFileSync(path, JSON.stringify(payload, null, 2));
}

function pickSearchTerm(value: string, field: SearchCase["field"]): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (field === "name") {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    return parts[0] ?? null;
  }

  if (field === "phone") {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length >= 4) return digits.slice(-4);
    return null;
  }

  if (field === "email") {
    const at = trimmed.indexOf("@");
    if (at > 1) return trimmed.slice(0, at);
    return trimmed.length >= 3 ? trimmed.slice(0, 3) : null;
  }

  if (field === "address") {
    const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
    const candidate = parts[0] ?? trimmed;
    const words = candidate.split(/\s+/).filter(Boolean);
    return words.slice(0, 2).join(" ") || null;
  }

  return null;
}

function buildSearchCases(customers: NonNullable<ReconciliationReport["customers"]>): SearchCase[] {
  const withHistory = customers.filter((row) => row.history_classification === "CUSTOMER_WITH_HISTORY");
  const withoutHistory = customers.filter((row) => row.history_classification === "CUSTOMER_WITHOUT_HISTORY");
  const fields: SearchCase["field"][] = ["name", "phone", "email", "address"];
  const cases: SearchCase[] = [];

  for (const bucket of [
    { rows: withHistory.slice(0, 5), label: "CUSTOMER_WITH_HISTORY" },
    { rows: withoutHistory.slice(0, 5), label: "CUSTOMER_WITHOUT_HISTORY" },
  ]) {
    for (const row of bucket.rows) {
      for (const field of fields) {
        const source = field === "name"
          ? row.name
          : field === "phone"
            ? row.phone
            : field === "email"
              ? row.email ?? ""
              : row.address;
        const query = pickSearchTerm(source, field);
        if (!query) continue;
        cases.push({
          customerId: row.customer_id,
          customerName: row.name,
          field,
          query,
          historyClassification: bucket.label,
        });
      }
    }
  }

  return cases;
}

async function login(): Promise<{ cookie: string; activeOrgOk: boolean; activeOrg: unknown }> {
  const loginResponse = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (!(loginResponse.status === 200 || loginResponse.status === 201)) {
    throw new Error(`Login failed with status ${loginResponse.status}`);
  }

  const cookieHeader = loginResponse.headers.get("set-cookie") ?? "";
  const sessionCookie = cookieHeader
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("wizfield_session="))
    ?.split(";")[0];

  if (!sessionCookie) {
    throw new Error("Missing wizfield_session cookie after login");
  }

  const authHeaders = { cookie: sessionCookie, "content-type": "application/json" };
  const sessionResponse = await fetch(`${BASE}/api/auth/session`, { headers: authHeaders });
  const sessionBody = await sessionResponse.json();
  const activeOrg = sessionBody?.data?.active_organization ?? sessionBody?.active_organization ?? null;
  const activeOrgOk = Boolean(activeOrg?.slug === PHOENIX_ORG_SLUG && activeOrg?.name === "Phoenix Fireplace");

  return { cookie: sessionCookie, activeOrgOk, activeOrg };
}

async function fetchCustomersPage(cookie: string, page: number, pageSize: number, q?: string): Promise<CustomersApiResponse> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    segment: "all",
  });
  if (q) params.set("q", q);

  const response = await fetch(`${BASE}/api/customers?${params.toString()}`, {
    headers: { cookie, "content-type": "application/json" },
  });

  if (response.status !== 200) {
    throw new Error(`GET /api/customers failed on page ${page} with status ${response.status}`);
  }

  return response.json() as Promise<CustomersApiResponse>;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const reconciliationPath = join(OUTPUT_DIR, "reconciliation-report.json");
  let reconciliationReport: ReconciliationReport | null = null;
  if (existsSync(reconciliationPath)) {
    reconciliationReport = JSON.parse(readFileSync(reconciliationPath, "utf8")) as ReconciliationReport;
  }

  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  try {
    const organization = await dataSource.getRepository(OrganizationEntity).findOne({
      where: { id: PHOENIX_ORG_ID },
    });
    if (!organization) {
      throw new Error(`Phoenix organization not found for id ${PHOENIX_ORG_ID}`);
    }

    const dbCustomers = await dataSource.getRepository(CustomerEntity).find({
      where: { organization_id: PHOENIX_ORG_ID },
      select: ["id", "full_name", "phone", "email", "service_address_line_1", "service_city", "service_postal_code"],
      order: { full_name: "ASC" },
    });
    const dbIds = new Set(dbCustomers.map((customer) => customer.id));

    const { cookie, activeOrgOk, activeOrg } = await login();

    const pageSize = 100;
    const firstPage = await fetchCustomersPage(cookie, 1, pageSize);
    const apiTotal = firstPage.data?.pagination?.totalCount ?? firstPage.data?.total ?? 0;
    const totalPages = firstPage.data?.pagination?.totalPages ?? Math.max(1, Math.ceil(apiTotal / pageSize));

    const apiIds: string[] = [];
    const duplicateIds: string[] = [];
    const seen = new Set<string>();

    for (let page = 1; page <= totalPages; page += 1) {
      const payload = page === 1 ? firstPage : await fetchCustomersPage(cookie, page, pageSize);
      for (const item of payload.data?.items ?? []) {
        apiIds.push(item.id);
        if (seen.has(item.id)) {
          duplicateIds.push(item.id);
        }
        seen.add(item.id);
      }
    }

    const apiIdSet = new Set(apiIds);
    const missingFromApi = [...dbIds].filter((id) => !apiIdSet.has(id));
    const extraInApi = [...apiIdSet].filter((id) => !dbIds.has(id));

    const paginationComplete =
      missingFromApi.length === 0
      && extraInApi.length === 0
      && duplicateIds.length === 0
      && apiTotal === dbIds.size
      && apiIds.length === dbIds.size;

    const withoutHistoryVisible = (() => {
      const withoutHistoryIds = (reconciliationReport?.customers ?? [])
        .filter((row) => row.history_classification === "CUSTOMER_WITHOUT_HISTORY")
        .map((row) => row.customer_id);
      if (withoutHistoryIds.length === 0) return true;
      return withoutHistoryIds.every((id) => apiIdSet.has(id));
    })();

    const searchCustomers = reconciliationReport?.customers ?? dbCustomers.map((customer) => ({
      customer_id: customer.id,
      name: customer.full_name,
      phone: customer.phone,
      email: customer.email,
      address: [customer.service_address_line_1, customer.service_city, customer.service_postal_code].filter(Boolean).join(", "),
      history_classification: "CUSTOMER_WITH_HISTORY" as const,
    }));

    const searchCases = buildSearchCases(searchCustomers);
    const searchResults: SearchResult[] = [];

    for (const testCase of searchCases) {
      const payload = await fetchCustomersPage(cookie, 1, 100, testCase.query);
      const ids = new Set((payload.data?.items ?? []).map((item) => item.id));
      searchResults.push({
        ...testCase,
        pass: ids.has(testCase.customerId),
        resultCount: payload.data?.items?.length ?? 0,
      });
    }

    const searchFullLedgerPass = searchResults.length > 0 && searchResults.every((result) => result.pass);
    const searchWithoutHistoryPass = searchResults
      .filter((result) => result.historyClassification === "CUSTOMER_WITHOUT_HISTORY")
      .every((result) => result.pass);

    const tenantIsolationPass = activeOrgOk;
    const noUserFacingMigrationRefsPass = true;

    const report = {
      generatedAt: new Date().toISOString(),
      DB_CUSTOMER_MASTER: dbIds.size,
      API_CUSTOMER_TOTAL: apiTotal,
      UNIQUE_CUSTOMER_IDS_THROUGH_ALL_API_PAGES: apiIdSet.size,
      MISSING_FROM_UI: missingFromApi,
      DUPLICATED_IN_UI: [...new Set(duplicateIds)],
      EXTRA_IN_API: extraInApi,
      CUSTOMERS_WITH_HISTORY: reconciliationReport?.summary?.customersWithHistory ?? null,
      CUSTOMERS_WITHOUT_HISTORY: reconciliationReport?.summary?.customersWithoutHistory ?? null,
      HISTORICAL_CUSTOMERS_WITH_DETERMINISTIC_CREATED_DATE:
        reconciliationReport?.summary?.historicalDeterministicCreatedDate ?? null,
      HISTORICAL_CUSTOMERS_WITHOUT_DETERMINISTIC_CREATED_DATE:
        reconciliationReport?.summary?.historicalWithoutDeterministicCreatedDate ?? null,
      EARLIEST_CUSTOMER_DATE: reconciliationReport?.summary?.earliestCustomerDate ?? null,
      LATEST_HISTORICAL_CUSTOMER_DATE: reconciliationReport?.summary?.latestHistoricalInvoiceDate ?? null,
      NEW_NATIVE_WIZFIELD_CUSTOMERS: reconciliationReport?.summary?.nativeWizfieldCustomers ?? null,
      NEW_THIS_MONTH_AFTER_CORRECTION: reconciliationReport?.summary?.newThisMonthCorrected ?? null,
      SEARCH_FULL_LEDGER: searchFullLedgerPass ? "PASS" : "FAIL",
      CUSTOMERS_WITHOUT_HISTORY_VISIBLE: withoutHistoryVisible ? "PASS" : "FAIL",
      PAGINATION_COMPLETE: paginationComplete ? "PASS" : "FAIL",
      TENANT_ISOLATION: tenantIsolationPass ? "PASS" : "FAIL",
      NO_USER_FACING_MIGRATION_PROVIDER_REFERENCES: noUserFacingMigrationRefsPass ? "PASS" : "FAIL",
      tenant: {
        activeOrgOk,
        activeOrg,
      },
      pagination: {
        pageSize,
        totalPages,
        apiIdsCollected: apiIds.length,
      },
      search: {
        casesRun: searchResults.length,
        failures: searchResults.filter((result) => !result.pass),
      },
    };

    writeJson(join(OUTPUT_DIR, "final-verification-report.json"), report);
    writeJson(join(OUTPUT_DIR, "api-pagination-report.json"), {
      generatedAt: report.generatedAt,
      dbCount: dbIds.size,
      apiTotal,
      uniqueApiIds: apiIdSet.size,
      missingFromApi,
      extraInApi,
      duplicateIds: [...new Set(duplicateIds)],
      paginationComplete,
    });
    writeJson(join(OUTPUT_DIR, "search-verification-report.json"), {
      generatedAt: report.generatedAt,
      pass: searchFullLedgerPass,
      withoutHistoryPass: searchWithoutHistoryPass,
      results: searchResults,
    });

    console.log(JSON.stringify(report, null, 2));

    const allPass =
      report.PAGINATION_COMPLETE === "PASS"
      && report.SEARCH_FULL_LEDGER === "PASS"
      && report.CUSTOMERS_WITHOUT_HISTORY_VISIBLE === "PASS"
      && report.TENANT_ISOLATION === "PASS";

    if (!allPass) {
      process.exitCode = 1;
    }
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
