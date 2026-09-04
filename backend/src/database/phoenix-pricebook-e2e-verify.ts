/**
 * Phoenix pricebook + field invoice end-to-end verification.
 *
 * Prerequisites:
 * - Backend running on PHOENIX_VERIFY_BASE_URL (default http://localhost:4000)
 * - PHOENIX_OWNER_PASSWORD in backend/.env
 * - Phoenix bootstrap completed (npm run phoenix:pricebook:bootstrap)
 *
 * Run: npm run phoenix:pricebook:verify
 */
import "../load-env";
import "reflect-metadata";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import bcrypt from "bcrypt";
import { DataSource, In } from "typeorm";

const PHOENIX_OWNER_EMAIL =
  process.env.PHOENIX_OWNER_EMAIL?.trim().toLowerCase() || "phoenixfireplace0@gmail.com";
import { AuthSessionEntity } from "./entities/auth-session.entity";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { JobEntity } from "./entities/job.entity";
import { MembershipEntity } from "./entities/membership.entity";
import { PricebookBundleRequirementEntity } from "./entities/pricebook-bundle-requirement.entity";
import { PricebookBundleEntity } from "./entities/pricebook-bundle.entity";
import { PricebookCategoryEntity } from "./entities/pricebook-category.entity";
import { PricebookItemEntity } from "./entities/pricebook-item.entity";
import { PricebookSystemEntity } from "./entities/pricebook-system.entity";
import { ProfileEntity } from "./entities/profile.entity";
import { TechnicianEntity } from "./entities/technician.entity";
import { UserEntity } from "./entities/user.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import {
  PHOENIX_ORG_ID,
  PHOENIX_ORG_SLUG,
} from "./workiz/workiz-production-mutation-guard";

const BASE = process.env.PHOENIX_VERIFY_BASE_URL ?? "http://localhost:4000";
const RUN_TAG = `pb-e2e-${Date.now().toString(36)}`;

function requireOwnerPassword() {
  const password = process.env.PHOENIX_OWNER_PASSWORD?.trim();
  return password || null;
}

async function createSessionCookie(
  dataSource: DataSource,
  userId: string,
  organizationId: string,
  cleanup: CleanupIds,
) {
  const rawToken = randomBytes(48).toString("hex");
  const session = await dataSource.getRepository(AuthSessionEntity).save(
    dataSource.getRepository(AuthSessionEntity).create({
      session_token_hash: createHash("sha256").update(rawToken).digest("hex"),
      user_id: userId,
      active_organization_id: organizationId,
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000),
      ip_address: "127.0.0.1",
      user_agent: "phoenix-pricebook-e2e-verify",
    }),
  );
  cleanup.sessionIds.push(session.id);
  const cookieName = process.env.SESSION_COOKIE_NAME?.trim() || "wizfield_session";
  return `${cookieName}=${rawToken}`;
}

type WorkflowResult = {
  workflow: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail?: unknown;
};

type CleanupIds = {
  sessionIds: string[];
  userIds: string[];
  technicianIds: string[];
  customerIds: string[];
  jobIds: string[];
  invoiceIds: string[];
  itemIds: string[];
  bundleIds: string[];
  requirementIds: string[];
};

function extractSessionCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) {
    return null;
  }

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

function extractJobId(raw: unknown, data: { id?: string } | undefined) {
  if (data?.id) {
    return data.id;
  }

  if (raw && typeof raw === "object" && raw !== null && "data" in raw) {
    const payload = raw as { data?: { job?: { id?: string }; id?: string } };
    return payload.data?.job?.id ?? payload.data?.id ?? "";
  }

  return "";
}

function extractInvoiceId(raw: unknown, data: { id?: string } | undefined) {
  if (data?.id) {
    return data.id;
  }

  if (raw && typeof raw === "object" && raw !== null && "data" in raw) {
    const payload = raw as { data?: { invoice?: { id?: string }; id?: string } };
    return payload.data?.invoice?.id ?? payload.data?.id ?? "";
  }

  return "";
}

function unwrap<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }

  return body as T;
}

function extractInvoiceLines(
  data: { line_items?: unknown[]; invoice?: { line_items?: unknown[] } } | undefined,
) {
  if (!data) {
    return [] as Array<Record<string, unknown>>;
  }

  if (Array.isArray(data.line_items)) {
    return data.line_items as Array<Record<string, unknown>>;
  }

  if (Array.isArray(data.invoice?.line_items)) {
    return data.invoice.line_items as Array<Record<string, unknown>>;
  }

  return [];
}

function record(results: WorkflowResult[], workflow: string, status: WorkflowResult["status"], detail?: unknown) {
  results.push({ workflow, status, detail });
  console.log(`${status}  ${workflow}${detail ? `: ${JSON.stringify(detail)}` : ""}`);
}

async function login(email: string, password: string) {
  const login = await fetchJson(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const cookie = extractSessionCookie(login.response.headers.get("set-cookie"));

  if (!cookie || !(login.response.status === 200 || login.response.status === 201)) {
    throw new Error(`Login failed for ${email} with status ${login.response.status}`);
  }

  const session = unwrap<{ active_organization?: { id?: string; slug?: string } }>(
    (await fetchJson(`${BASE}/api/auth/session`, { headers: { cookie } })).body,
  );

  return { cookie, session };
}

async function api<T>(
  cookie: string,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; data: T; raw: unknown }> {
  const { response, body } = await fetchJson(`${BASE}${path}`, {
    ...init,
    headers: {
      cookie,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  return {
    status: response.status,
    data: unwrap<T>(body),
    raw: body,
  };
}

async function seedTempTechnician(dataSource: DataSource, cleanup: CleanupIds) {
  const token = randomUUID();
  const email = `phoenix-pb-verify-${token.slice(0, 8)}@wizfield.local`;
  const password = `PbVerify!${token.slice(0, 8)}`;
  const passwordHash = await bcrypt.hash(password, 10);

  const userRepo = dataSource.getRepository(UserEntity);
  const profileRepo = dataSource.getRepository(ProfileEntity);
  const membershipRepo = dataSource.getRepository(MembershipEntity);
  const technicianRepo = dataSource.getRepository(TechnicianEntity);

  const user = await userRepo.save(userRepo.create({
    id: randomUUID(),
    email,
    password_hash: passwordHash,
    is_active: true,
  }));

  await profileRepo.save(profileRepo.create({
    id: randomUUID(),
    auth_user_id: user.id,
    full_name: "Pricebook Verify Technician",
    phone: null,
    role: "technician",
  }));

  await membershipRepo.save(membershipRepo.create({
    id: randomUUID(),
    user_id: user.id,
    organization_id: PHOENIX_ORG_ID,
    role: "technician",
    status: "active",
    custom_role_id: null,
    custom_permission_keys: null,
  }));

  const technician = await technicianRepo.save(technicianRepo.create({
    id: randomUUID(),
    organization_id: PHOENIX_ORG_ID,
    auth_user_id: user.id,
    display_name: "Pricebook Verify Technician",
    phone: null,
    specialties: [],
    is_active: true,
    last_seen_at: null,
  }));

  cleanup.userIds.push(user.id);
  cleanup.technicianIds.push(technician.id);

  return { email, password, technicianId: technician.id };
}

async function countInventoryMovements(dataSource: DataSource) {
  const rows = await dataSource.query(
    "SELECT COUNT(*) AS count FROM inventory_movements WHERE organization_id = ?",
    [PHOENIX_ORG_ID],
  );
  return Number(rows[0]?.count ?? 0);
}

async function cleanupRecords(dataSource: DataSource, cleanup: CleanupIds) {
  if (cleanup.sessionIds.length) {
    await dataSource.getRepository(AuthSessionEntity).delete({ id: In(cleanup.sessionIds) });
  }

  if (cleanup.invoiceIds.length) {
    await dataSource.getRepository(InvoiceLineItemEntity).delete({ invoice_id: In(cleanup.invoiceIds) });
    await dataSource.getRepository(InvoiceEntity).delete({ id: In(cleanup.invoiceIds) });
  }

  if (cleanup.jobIds.length) {
    const jobIds = cleanup.jobIds.filter(Boolean);
    if (jobIds.length) {
      await dataSource.getRepository(JobEntity).delete({ id: In(jobIds) });
    }
  }

  if (cleanup.customerIds.length) {
    await dataSource.getRepository(CustomerEntity).delete({ id: In(cleanup.customerIds) });
  }

  if (cleanup.requirementIds.length) {
    await dataSource.getRepository(PricebookBundleRequirementEntity).delete({ id: In(cleanup.requirementIds) });
  }

  if (cleanup.bundleIds.length) {
    await dataSource.getRepository(PricebookBundleEntity).delete({ id: In(cleanup.bundleIds) });
  }

  if (cleanup.itemIds.length) {
    await dataSource.getRepository(PricebookItemEntity).delete({ id: In(cleanup.itemIds) });
  }

  if (cleanup.technicianIds.length) {
    await dataSource.getRepository(TechnicianEntity).delete({ id: In(cleanup.technicianIds) });
  }

  if (cleanup.userIds.length) {
    await dataSource.getRepository(MembershipEntity).delete({ user_id: In(cleanup.userIds) });
    await dataSource.getRepository(ProfileEntity).delete({ auth_user_id: In(cleanup.userIds) });
    await dataSource.getRepository(UserEntity).delete({ id: In(cleanup.userIds) });
  }
}

async function main() {
  const results: WorkflowResult[] = [];
  const cleanup: CleanupIds = {
    sessionIds: [],
    userIds: [],
    technicianIds: [],
    customerIds: [],
    jobIds: [],
    invoiceIds: [],
    itemIds: [],
    bundleIds: [],
    requirementIds: [],
  };

  const dataSource = new DataSource({
    ...buildDataSourceOptions(),
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();

  let ownerCookie = "";
  let techCookie = "";
  let techTechnicianId = "";
  let gasSystemId = "";
  let categoryIds: Record<string, string> = {};
  let itemZeroId = "";
  let itemWarrantyOffId = "";
  let itemWarrantyOnId = "";
  let itemValveId = "";
  let itemPilotId = "";
  let itemModuleId = "";
  let bundleId = "";
  let assignedJobId = "";
  let unassignedJobId = "";
  let assignedInvoiceId = "";

  try {
    const ownerUser = await dataSource.getRepository(UserEntity).findOne({
      where: { email: PHOENIX_OWNER_EMAIL },
    });

    if (!ownerUser) {
      throw new Error(`Phoenix owner user not found for ${PHOENIX_OWNER_EMAIL}`);
    }

    const ownerPassword = requireOwnerPassword();
    if (ownerPassword) {
      const ownerLogin = await login(PHOENIX_OWNER_EMAIL, ownerPassword);
      ownerCookie = ownerLogin.cookie;
      record(
        results,
        "Owner session resolves to Phoenix org",
        ownerLogin.session?.active_organization?.id === PHOENIX_ORG_ID ? "PASS" : "FAIL",
        ownerLogin.session?.active_organization,
      );
    } else {
      ownerCookie = await createSessionCookie(dataSource, ownerUser.id, PHOENIX_ORG_ID, cleanup);
      const ownerSession = unwrap<{ active_organization?: { id?: string } }>(
        (await fetchJson(`${BASE}/api/auth/session`, { headers: { cookie: ownerCookie } })).body,
      );
      record(
        results,
        "Owner session resolves to Phoenix org",
        ownerSession?.active_organization?.id === PHOENIX_ORG_ID ? "PASS" : "FAIL",
        ownerSession?.active_organization,
      );
    }

    const tempTech = await seedTempTechnician(dataSource, cleanup);
    techTechnicianId = tempTech.technicianId;
    techCookie = await createSessionCookie(dataSource, cleanup.userIds[0], PHOENIX_ORG_ID, cleanup);
    const techSession = unwrap<{ active_organization?: { id?: string } }>(
      (await fetchJson(`${BASE}/api/auth/session`, { headers: { cookie: techCookie } })).body,
    );
    record(
      results,
      "Temporary technician login",
      techSession?.active_organization?.id === PHOENIX_ORG_ID ? "PASS" : "FAIL",
    );

    const systems = await api<{ systems: Array<{ id: string; name: string; code: string }> }>(
      ownerCookie,
      "/api/pricebook/systems",
    );
    const systemNames = systems.data.systems.map((system) => system.name).sort();
    record(
      results,
      "Owner/Admin: Pricebook lists Gas / Wood / General",
      JSON.stringify(systemNames) === JSON.stringify(["Gas", "General", "Wood"]) ? "PASS" : "FAIL",
      systemNames,
    );

    gasSystemId = systems.data.systems.find((system) => system.code === "gas")?.id ?? "";
    const categories = await api<{ categories: Array<{ id: string; name: string; system_id: string | null }> }>(
      ownerCookie,
      `/api/pricebook/categories?systemId=${gasSystemId}`,
    );
    for (const category of categories.data.categories) {
      categoryIds[category.name] = category.id;
    }

    const zeroItem = await api<{ id: string; customer_price_cents: number; category_id: string | null; warranty_months: number | null }>(
      ownerCookie,
      "/api/pricebook/items",
      {
        method: "POST",
        body: JSON.stringify({
          name: `${RUN_TAG} Zero Price Test Item`,
          systemId: gasSystemId,
          categoryId: categoryIds["Gas Control Valves"],
          customerPriceCents: 0,
          itemType: "product",
        }),
      },
    );
    itemZeroId = zeroItem.data.id;
    cleanup.itemIds.push(itemZeroId);
    record(
      results,
      "Owner/Admin: $0 price item creates successfully",
      zeroItem.status >= 200 && zeroItem.status < 300 && zeroItem.data.customer_price_cents === 0 ? "PASS" : "FAIL",
      zeroItem.data,
    );

    const warrantyOff = await api<{ id: string; warranty_months: number | null; category_id: string | null; category?: { name?: string } | null }>(
      ownerCookie,
      "/api/pricebook/items",
      {
        method: "POST",
        body: JSON.stringify({
          name: `${RUN_TAG} Warranty Off Item`,
          systemId: gasSystemId,
          categoryId: categoryIds["Pilot Assemblies"],
          customerPriceCents: 10000,
          itemType: "product",
          warrantyMonths: null,
        }),
      },
    );
    itemWarrantyOffId = warrantyOff.data.id;
    cleanup.itemIds.push(itemWarrantyOffId);
    record(
      results,
      "Owner/Admin: warranty OFF stores null",
      warrantyOff.data.warranty_months == null ? "PASS" : "FAIL",
      { warranty_months: warrantyOff.data.warranty_months },
    );
    record(
      results,
      "Owner/Admin: category assignment on create",
      warrantyOff.data.category_id === categoryIds["Pilot Assemblies"] ? "PASS" : "FAIL",
      { category_id: warrantyOff.data.category_id },
    );

    const warrantyOn = await api<{ id: string; warranty_months: number | null }>(
      ownerCookie,
      "/api/pricebook/items",
      {
        method: "POST",
        body: JSON.stringify({
          name: `${RUN_TAG} Warranty On Item`,
          systemId: gasSystemId,
          categoryId: categoryIds["Control Modules"],
          customerPriceCents: 15000,
          itemType: "product",
          warrantyMonths: 12,
        }),
      },
    );
    itemWarrantyOnId = warrantyOn.data.id;
    cleanup.itemIds.push(itemWarrantyOnId);
    record(
      results,
      "Owner/Admin: warranty ON stores months",
      warrantyOn.data.warranty_months === 12 ? "PASS" : "FAIL",
      { warranty_months: warrantyOn.data.warranty_months },
    );

    const techSystems = await api<{ systems: Array<{ id: string }> }>(techCookie, "/api/pricebook/systems");
    record(
      results,
      "Technician RBAC: can read Pricebook systems",
      techSystems.status === 200 ? "PASS" : "FAIL",
      { status: techSystems.status },
    );

    const techCreateItem = await api(techCookie, "/api/pricebook/items", {
      method: "POST",
      body: JSON.stringify({
        name: `${RUN_TAG} Tech Forbidden Item`,
        systemId: gasSystemId,
        categoryId: categoryIds["Gas Control Valves"],
        customerPriceCents: 100,
        itemType: "product",
      }),
    });
    record(
      results,
      "Technician RBAC: cannot manage Pricebook",
      techCreateItem.status === 403 ? "PASS" : "FAIL",
      { status: techCreateItem.status },
    );

    const customer = await api<{ id: string }>(ownerCookie, "/api/customers", {
      method: "POST",
      body: JSON.stringify({
        fullName: `${RUN_TAG} Customer`,
        phone: "4035550100",
        email: null,
        companyName: null,
        serviceAddressLine1: "123 Verify St",
        serviceAddressLine2: null,
        serviceCity: "Calgary",
        serviceStateOrRegion: "AB",
        servicePostalCode: "T2P1A1",
        notes: "Pricebook E2E verify",
      }),
    });
    cleanup.customerIds.push(customer.data.id);

    const scheduledFor = new Date(Date.now() + 86_400_000).toISOString();
    const assignedJob = await api<{ id: string }>(ownerCookie, "/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        customerId: customer.data.id,
        jobType: "installation_repair",
        serviceType: "repair",
        serviceAddressLine1: "123 Verify St",
        serviceCity: "Calgary",
        servicePostalCode: "T2P1A1",
        scheduledFor,
        assignedTechnicianId: techTechnicianId,
      }),
    });
    assignedJobId = extractJobId(assignedJob.raw, assignedJob.data);
    if (assignedJob.status >= 400 || !assignedJobId) {
      throw new Error(`Assigned job create failed (${assignedJob.status}): ${JSON.stringify(assignedJob.raw)}`);
    }
    cleanup.jobIds.push(assignedJobId);

    const unassignedJob = await api<{ id: string }>(ownerCookie, "/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        customerId: customer.data.id,
        jobType: "installation_repair",
        serviceType: "repair",
        serviceAddressLine1: "123 Verify St",
        serviceCity: "Calgary",
        servicePostalCode: "T2P1A1",
      }),
    });
    unassignedJobId = extractJobId(unassignedJob.raw, unassignedJob.data);
    if (unassignedJob.status >= 400 || !unassignedJobId) {
      throw new Error(`Unassigned job create failed (${unassignedJob.status}): ${JSON.stringify(unassignedJob.raw)}`);
    }
    cleanup.jobIds.push(unassignedJobId);

    const techAssignedInvoice = await api<{ id: string }>(techCookie, `/api/jobs/${assignedJobId}/invoice`, {
      method: "PUT",
      body: JSON.stringify({
        amountCents: 0,
        status: "unpaid",
        taxRateBps: 0,
        lineItems: [{
          kind: "pricebook_item",
          documentLineKey: `${RUN_TAG}-assigned-line`,
          pricebookItemId: itemZeroId,
          quantity: "1",
          sortOrder: 0,
          unitPriceCentsOverride: 0,
        }],
      }),
    });
    assignedInvoiceId = extractInvoiceId(techAssignedInvoice.raw, techAssignedInvoice.data);
    if (assignedInvoiceId) {
      cleanup.invoiceIds.push(assignedInvoiceId);
    }
    record(
      results,
      "Technician RBAC: can create/edit invoice on assigned job",
      techAssignedInvoice.status === 200 || techAssignedInvoice.status === 201 ? "PASS" : "FAIL",
      { status: techAssignedInvoice.status },
    );

    const techUnassignedInvoice = await api(techCookie, `/api/jobs/${unassignedJobId}/invoice`, {
      method: "PUT",
      body: JSON.stringify({
        amountCents: 0,
        status: "unpaid",
        taxRateBps: 0,
        lineItems: [{
          kind: "pricebook_item",
          documentLineKey: `${RUN_TAG}-blocked-line`,
          pricebookItemId: itemZeroId,
          quantity: "1",
          sortOrder: 0,
        }],
      }),
    });
    record(
      results,
      "Technician RBAC: cannot manage invoice on unassigned job",
      techUnassignedInvoice.status === 403 ? "PASS" : "FAIL",
      { status: techUnassignedInvoice.status },
    );

    const lineKey = `${RUN_TAG}-single-item`;
    const singleItemInvoice = await api<{ id: string }>(ownerCookie, `/api/jobs/${assignedJobId}/invoice`, {
      method: "PUT",
      body: JSON.stringify({
        amountCents: 25000,
        status: "unpaid",
        taxRateBps: 0,
        lineItems: [{
          kind: "pricebook_item",
          documentLineKey: lineKey,
          pricebookItemId: itemWarrantyOnId,
          quantity: "1",
          sortOrder: 0,
          unitPriceCentsOverride: 25000,
          warrantyMonthsOverride: 24,
          catalogUnitPriceCentsSnapshot: 15000,
        }],
      }),
    });
    assignedInvoiceId = extractInvoiceId(singleItemInvoice.raw, singleItemInvoice.data);
    if (assignedInvoiceId) {
      cleanup.invoiceIds.push(assignedInvoiceId);
    }

    const invoiceDetail = await api<{
      line_items?: Array<{
        id: string;
        pricebook_item_id: string | null;
        unit_price_cents_snapshot: number;
        warranty_months_snapshot: number | null;
        catalog_unit_price_cents_snapshot: number | null;
        name_snapshot: string;
      }>;
      invoice?: {
        line_items?: Array<{
          id: string;
          pricebook_item_id: string | null;
          unit_price_cents_snapshot: number;
          warranty_months_snapshot: number | null;
          catalog_unit_price_cents_snapshot: number | null;
          name_snapshot: string;
        }>;
      };
    }>(ownerCookie, `/api/invoices/${assignedInvoiceId}`);

    const persistedLines = extractInvoiceLines(invoiceDetail.data) as Array<{
      pricebook_item_id: string | null;
      unit_price_cents_snapshot: number;
      warranty_months_snapshot: number | null;
      catalog_unit_price_cents_snapshot: number | null;
    }>;
    const singleLine = persistedLines.find((line) => line.pricebook_item_id === itemWarrantyOnId);
    record(
      results,
      "Single Item invoice: independent invoice line persisted",
      singleLine && persistedLines.length >= 1 ? "PASS" : "FAIL",
      { lineCount: persistedLines.length },
    );
    record(
      results,
      "Single Item invoice: editable price persisted",
      singleLine?.unit_price_cents_snapshot === 25000 ? "PASS" : "FAIL",
      { unit_price_cents_snapshot: singleLine?.unit_price_cents_snapshot },
    );
    record(
      results,
      "Single Item invoice: editable warranty persisted",
      singleLine?.warranty_months_snapshot === 24 ? "PASS" : "FAIL",
      { warranty_months_snapshot: singleLine?.warranty_months_snapshot },
    );
    record(
      results,
      "Single Item invoice: catalog snapshot preserved",
      singleLine?.catalog_unit_price_cents_snapshot === 15000 ? "PASS" : "FAIL",
      { catalog_unit_price_cents_snapshot: singleLine?.catalog_unit_price_cents_snapshot },
    );

    await api(ownerCookie, `/api/pricebook/items/${itemWarrantyOnId}`, {
      method: "PATCH",
      body: JSON.stringify({ warrantyMonths: 36, customerPriceCents: 99999 }),
    });
    const invoiceAfterCatalogChange = await api<{
      line_items?: Array<{ warranty_months_snapshot: number | null; unit_price_cents_snapshot: number }>;
      invoice?: { line_items?: Array<{ warranty_months_snapshot: number | null; unit_price_cents_snapshot: number }> };
    }>(ownerCookie, `/api/invoices/${assignedInvoiceId}`);
    const linesAfterChange = extractInvoiceLines(invoiceAfterCatalogChange.data) as Array<{
      warranty_months_snapshot: number | null;
      unit_price_cents_snapshot: number;
    }>;
    const lineAfterChange = linesAfterChange.find((line) => line.unit_price_cents_snapshot === 25000);
    record(
      results,
      "Invoice-line warranty is transaction snapshot (not rewritten by Pricebook changes)",
      lineAfterChange?.warranty_months_snapshot === 24 ? "PASS" : "FAIL",
      { warranty_months_snapshot: lineAfterChange?.warranty_months_snapshot },
    );

    const valveItem = await api<{ id: string }>(ownerCookie, "/api/pricebook/items", {
      method: "POST",
      body: JSON.stringify({
        name: `${RUN_TAG} Valve Item`,
        systemId: gasSystemId,
        categoryId: categoryIds["Gas Control Valves"],
        customerPriceCents: 50000,
        itemType: "product",
        inventoryTrackingMode: "future_tracked",
      }),
    });
    itemValveId = valveItem.data.id;
    cleanup.itemIds.push(itemValveId);

    const pilotItem = await api<{ id: string }>(ownerCookie, "/api/pricebook/items", {
      method: "POST",
      body: JSON.stringify({
        name: `${RUN_TAG} Pilot Item`,
        systemId: gasSystemId,
        categoryId: categoryIds["Pilot Assemblies"],
        customerPriceCents: 30000,
        itemType: "product",
      }),
    });
    itemPilotId = pilotItem.data.id;
    cleanup.itemIds.push(itemPilotId);

    const moduleItem = await api<{ id: string }>(ownerCookie, "/api/pricebook/items", {
      method: "POST",
      body: JSON.stringify({
        name: `${RUN_TAG} Module Item`,
        systemId: gasSystemId,
        categoryId: categoryIds["Control Modules"],
        customerPriceCents: 40000,
        itemType: "product",
      }),
    });
    itemModuleId = moduleItem.data.id;
    cleanup.itemIds.push(itemModuleId);

    const bundle = await api<{ id: string }>(ownerCookie, "/api/pricebook/bundles", {
      method: "POST",
      body: JSON.stringify({
        name: `${RUN_TAG} Valve + Pilot + Control Module`,
        description: "Temporary E2E bundle",
        isActive: true,
      }),
    });
    bundleId = bundle.data.id;
    cleanup.bundleIds.push(bundleId);

    const requirementSpecs = [
      { label: "Gas Control Valve", categoryName: "Gas Control Valves" },
      { label: "Pilot Assembly", categoryName: "Pilot Assemblies" },
      { label: "Control Module", categoryName: "Control Modules" },
    ] as const;

    const requirementIds: string[] = [];
    for (const [index, spec] of requirementSpecs.entries()) {
      const requirement = await api<{ id: string }>(ownerCookie, `/api/pricebook/bundles/${bundleId}/requirements`, {
        method: "POST",
        body: JSON.stringify({
          label: spec.label,
          categoryId: categoryIds[spec.categoryName],
          defaultQuantity: "1",
          sortOrder: index,
        }),
      });
      requirementIds.push(requirement.data.id);
      cleanup.requirementIds.push(requirement.data.id);
    }

    const bundleDetail = await api<{
      requirements: Array<{ id: string; category_id: string; label: string }>;
    }>(ownerCookie, `/api/pricebook/bundles/${bundleId}`);
    record(
      results,
      "Bundle: requirements expose category filters for technician resolution",
      bundleDetail.data.requirements.length === 3 ? "PASS" : "FAIL",
      { requirementCount: bundleDetail.data.requirements.length },
    );

    const inventoryBefore = await countInventoryMovements(dataSource);
    const bundleLineItems = [
      {
        kind: "pricebook_item" as const,
        documentLineKey: `${RUN_TAG}-bundle-valve`,
        pricebookItemId: itemValveId,
        quantity: "1",
        sortOrder: 0,
        unitPriceCentsOverride: 0,
        catalogUnitPriceCentsSnapshot: 50000,
        pricebookBundleId: bundleId,
        bundleRequirementId: requirementIds[0],
      },
      {
        kind: "pricebook_item" as const,
        documentLineKey: `${RUN_TAG}-bundle-pilot`,
        pricebookItemId: itemPilotId,
        quantity: "1",
        sortOrder: 1,
        unitPriceCentsOverride: 0,
        catalogUnitPriceCentsSnapshot: 30000,
        pricebookBundleId: bundleId,
        bundleRequirementId: requirementIds[1],
      },
      {
        kind: "pricebook_item" as const,
        documentLineKey: `${RUN_TAG}-bundle-module`,
        pricebookItemId: itemModuleId,
        quantity: "1",
        sortOrder: 2,
        unitPriceCentsOverride: 0,
        catalogUnitPriceCentsSnapshot: 40000,
        pricebookBundleId: bundleId,
        bundleRequirementId: requirementIds[2],
      },
    ];

    const bundleInvoice = await api<{ id: string }>(ownerCookie, `/api/jobs/${assignedJobId}/invoice`, {
      method: "PUT",
      body: JSON.stringify({
        amountCents: 0,
        status: "unpaid",
        taxRateBps: 0,
        lineItems: bundleLineItems,
      }),
    });
    assignedInvoiceId = extractInvoiceId(bundleInvoice.raw, bundleInvoice.data);
    if (assignedInvoiceId) {
      cleanup.invoiceIds.push(assignedInvoiceId);
    }

    const bundleInvoiceDetail = await api<{
      line_items?: Array<{
        pricebook_item_id: string | null;
        unit_price_cents_snapshot: number;
        catalog_unit_price_cents_snapshot: number | null;
        pricebook_bundle_id: string | null;
        bundle_requirement_id: string | null;
      }>;
      invoice?: {
        line_items?: Array<{
          pricebook_item_id: string | null;
          unit_price_cents_snapshot: number;
          catalog_unit_price_cents_snapshot: number | null;
          pricebook_bundle_id: string | null;
          bundle_requirement_id: string | null;
        }>;
      };
      total_cents?: number;
    }>(ownerCookie, `/api/invoices/${assignedInvoiceId}`);

    const bundleLines = extractInvoiceLines(bundleInvoiceDetail.data) as Array<{
      unit_price_cents_snapshot: number;
      pricebook_bundle_id: string | null;
      bundle_requirement_id: string | null;
    }>;
    record(
      results,
      "Bundle: produces 3 independent invoice lines (not one bundle line)",
      bundleLines.length === 3 ? "PASS" : "FAIL",
      { lineCount: bundleLines.length },
    );
    record(
      results,
      "Bundle-generated invoice lines begin at $0.00",
      bundleLines.every((line) => line.unit_price_cents_snapshot === 0) ? "PASS" : "FAIL",
      bundleLines.map((line) => line.unit_price_cents_snapshot),
    );
    record(
      results,
      "Bundle metadata stored per resolved line",
      bundleLines.every((line) => line.pricebook_bundle_id === bundleId && line.bundle_requirement_id)
        ? "PASS"
        : "FAIL",
    );

    const inventoryAfter = await countInventoryMovements(dataSource);
    record(
      results,
      "Inventory-linked item selection does NOT consume inventory prematurely",
      inventoryAfter === inventoryBefore ? "PASS" : "FAIL",
      { before: inventoryBefore, after: inventoryAfter },
    );

    const zeroSave = await api(ownerCookie, `/api/jobs/${assignedJobId}/invoice`, {
      method: "PUT",
      body: JSON.stringify({
        amountCents: 0,
        status: "unpaid",
        taxRateBps: 0,
        lineItems: bundleLineItems,
      }),
    });
    record(
      results,
      "Backend allows saving $0 invoice total (confirmation gate is UI responsibility)",
      zeroSave.status === 200 ? "PASS" : "FAIL",
      { status: zeroSave.status, total: 0 },
    );

    const jobInvoiceSection = readFileSync(
      join(__dirname, "../../../frontend/app/jobs/[jobId]/job-invoice-section.tsx"),
      "utf8",
    );
    record(
      results,
      "UI $0 total requires explicit confirmation before save",
      jobInvoiceSection.includes("previewTotals.totalCents === 0") && jobInvoiceSection.includes("window.confirm")
        ? "PASS"
        : "FAIL",
    );
  } catch (error) {
    record(results, "Unhandled verification error", "FAIL", error instanceof Error ? error.message : String(error));
  } finally {
    try {
      await cleanupRecords(dataSource, cleanup);
      record(results, "Cleanup temporary test records", "PASS", cleanup);
    } catch (error) {
      record(results, "Cleanup temporary test records", "FAIL", error instanceof Error ? error.message : String(error));
    }

    await dataSource.destroy();
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    organizationId: PHOENIX_ORG_ID,
    organizationSlug: PHOENIX_ORG_SLUG,
    runTag: RUN_TAG,
    overall: results.every((result) => result.status === "PASS") ? "PASS" : "FAIL",
    results,
  };

  console.log("\n" + JSON.stringify(summary, null, 2));
  process.exitCode = summary.overall === "PASS" ? 0 : 1;
}

void main();
