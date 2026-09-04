/**
 * Phoenix Pricebook population via canonical application APIs only.
 *
 * Every item is created through POST /api/pricebook/items (same path as /pricebook/new),
 * read back with GET /api/pricebook/items/:id, and verified before continuing.
 *
 * Prerequisites:
 * - Backend running (PHOENIX_VERIFY_BASE_URL, default http://127.0.0.1:4000)
 * - Phoenix structures bootstrapped (npm run phoenix:pricebook:bootstrap)
 * - Approved catalog dataset JSON (see backend/data/phoenix-pricebook-catalog.example.json)
 *
 * Usage:
 *   cp backend/data/phoenix-pricebook-catalog.example.json backend/data/phoenix-pricebook-catalog.json
 *   # Replace example entries with owner-approved catalog rows only.
 *   npm run phoenix:pricebook:populate --workspace backend
 *
 * Options:
 *   --catalog <path>     Override catalog file (default PHOENIX_PRICEBOOK_CATALOG_PATH)
 *   --validate-only      Validate dataset shape only; do not call APIs
 *
 * Catalog item fields (V1):
 *   supplierName, supplierSku, materialCostCents (Fire-Parts purchase cost),
 *   customerPriceCents ($0), warrantyEnabled (false), oemCrossReference → internalDescription
 */
import "../load-env";
import "reflect-metadata";

import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";

import { DataSource } from "typeorm";

import { AuthSessionEntity } from "./entities/auth-session.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { PHOENIX_ORG_ID } from "./workiz/workiz-production-mutation-guard";

const PHOENIX_OWNER_EMAIL =
  process.env.PHOENIX_OWNER_EMAIL?.trim().toLowerCase() || "phoenixfireplace0@gmail.com";

const BASE = process.env.PHOENIX_VERIFY_BASE_URL ?? "http://127.0.0.1:4000";
const DEFAULT_CATALOG_PATH = resolve(
  __dirname,
  "../../data/phoenix-pricebook-catalog.json",
);

type CatalogItem = {
  system: string;
  category: string;
  name: string;
  customerDescription: string | null;
  internalDescription: string | null;
  supplierName: string;
  supplierSku: string;
  materialCostCents: number;
  customerPriceCents: number;
  warrantyEnabled: boolean;
  warrantyMonths: number | null;
  imagePath: string | null;
};

type CatalogFile = {
  version: number;
  items: CatalogItem[];
};

type PricebookSystem = { id: string; name: string; code: string };
type PricebookCategory = { id: string; name: string; system_id: string | null };
type PricebookItem = {
  id: string;
  name: string;
  customer_description: string | null;
  internal_description: string | null;
  customer_price_cents: number;
  material_cost_cents: number;
  warranty_months: number | null;
  supplier_name: string | null;
  supplier_sku: string | null;
  category_id: string | null;
  category: { id: string; name: string; system_id: string | null; system: PricebookSystem | null } | null;
  system_id: string | null;
  system: PricebookSystem | null;
  image_url: string | null;
};

type AuditRow = {
  item: string;
  system: string;
  category: string;
  create: "CREATED" | "SKIPPED" | "FAILED" | "—";
  readBack: "PASS" | "FAIL" | "SKIPPED" | "—";
  result: "PASS" | "FAIL" | "SKIPPED";
  detail?: string;
};

function parseArgs(argv: string[]) {
  let catalogPath = process.env.PHOENIX_PRICEBOOK_CATALOG_PATH?.trim() || DEFAULT_CATALOG_PATH;
  let validateOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--validate-only") {
      validateOnly = true;
      continue;
    }

    if (arg === "--catalog" && argv[index + 1]) {
      catalogPath = resolve(argv[index + 1]);
      index += 1;
    }
  }

  return { catalogPath, validateOnly };
}

function requireString(value: unknown, fieldName: string, maxLength: number) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }

  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`);
  }

  return trimmed;
}

function optionalString(value: unknown, fieldName: string, maxLength: number) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string or null.`);
  }

  const trimmed = value.trim();
  return trimmed ? (trimmed.length > maxLength ? (() => { throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`); })() : trimmed) : null;
}

function requireNonNegativeInteger(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer (cents).`);
  }

  return value;
}

function requirePositiveInteger(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${fieldName} must be a positive integer (cents).`);
  }

  return value;
}

function formatCadFromCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function loadCatalog(catalogPath: string): { catalog: CatalogFile; catalogDir: string } {
  let raw: string;

  try {
    raw = readFileSync(catalogPath, "utf8");
  } catch {
    throw new Error(
      `Approved catalog file not found: ${catalogPath}\n`
      + "Copy backend/data/phoenix-pricebook-catalog.example.json to backend/data/phoenix-pricebook-catalog.json "
      + "and replace every entry with owner-approved Phoenix catalog data before running populate.",
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Catalog file is not valid JSON: ${catalogPath} (${error instanceof Error ? error.message : String(error)})`);
  }

  if (!parsed || typeof parsed !== "object" || !("items" in parsed)) {
    throw new Error("Catalog file must be an object with version and items.");
  }

  const record = parsed as Record<string, unknown>;

  if (record.version !== 1) {
    throw new Error("Catalog version must be 1.");
  }

  if (!Array.isArray(record.items)) {
    throw new Error("Catalog items must be an array.");
  }

  if (record.items.length === 0) {
    throw new Error(
      "Catalog items array is empty. Populate backend/data/phoenix-pricebook-catalog.json "
      + "with owner-approved Phoenix catalog rows before running.",
    );
  }

  const items: CatalogItem[] = [];
  const seen = new Set<string>();
  const seenSupplierSkus = new Set<string>();

  record.items.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`items[${index}] must be an object.`);
    }

    const row = entry as Record<string, unknown>;
    const system = requireString(row.system, `items[${index}].system`, 120);
    const category = requireString(row.category, `items[${index}].category`, 120);
    const name = requireString(row.name, `items[${index}].name`, 255);
    const customerDescription = optionalString(row.customerDescription, `items[${index}].customerDescription`, 4000);
    const oemCrossReference = optionalString(row.oemCrossReference, `items[${index}].oemCrossReference`, 4000);
    const internalDescription = optionalString(row.internalDescription, `items[${index}].internalDescription`, 4000)
      ?? oemCrossReference;
    const supplierName = requireString(row.supplierName, `items[${index}].supplierName`, 255);
    const supplierSku = requireString(row.supplierSku, `items[${index}].supplierSku`, 128);
    const materialCostCents = requirePositiveInteger(row.materialCostCents, `items[${index}].materialCostCents`);
    const customerPriceCents = requireNonNegativeInteger(row.customerPriceCents, `items[${index}].customerPriceCents`);

    if (supplierName !== "Fire-Parts") {
      throw new Error(`items[${index}].supplierName must be "Fire-Parts" for V1 Fire-Parts catalog rows.`);
    }

    if (customerPriceCents !== 0) {
      throw new Error(`items[${index}].customerPriceCents must be 0 for V1 catalog rows.`);
    }

    if (typeof row.warrantyEnabled !== "boolean") {
      throw new Error(`items[${index}].warrantyEnabled must be a boolean.`);
    }

    const warrantyEnabled = row.warrantyEnabled;
    let warrantyMonths: number | null = null;

    if (warrantyEnabled) {
      if (typeof row.warrantyMonths !== "number" || !Number.isInteger(row.warrantyMonths) || row.warrantyMonths < 1) {
        throw new Error(`items[${index}].warrantyMonths must be a positive integer when warrantyEnabled is true.`);
      }

      warrantyMonths = row.warrantyMonths;
    } else if (row.warrantyMonths !== undefined && row.warrantyMonths !== null) {
      throw new Error(`items[${index}].warrantyMonths must be null when warrantyEnabled is false.`);
    }

    let imagePath: string | null = null;

    if (row.imagePath !== undefined && row.imagePath !== null) {
      if (typeof row.imagePath !== "string" || !row.imagePath.trim()) {
        throw new Error(`items[${index}].imagePath must be a non-empty string or null.`);
      }

      imagePath = row.imagePath.trim();
    }

    const dedupeKey = `${system.toLowerCase()}|${category.toLowerCase()}|${name.toLowerCase()}`;

    if (seen.has(dedupeKey)) {
      throw new Error(`Duplicate catalog row at items[${index}] for ${system} / ${category} / ${name}.`);
    }

    seen.add(dedupeKey);

    const supplierSkuKey = supplierSku.toLowerCase();

    if (seenSupplierSkus.has(supplierSkuKey)) {
      throw new Error(`Duplicate supplierSku "${supplierSku}" at items[${index}].`);
    }

    seenSupplierSkus.add(supplierSkuKey);

    items.push({
      system,
      category,
      name,
      customerDescription,
      internalDescription,
      supplierName,
      supplierSku,
      materialCostCents,
      customerPriceCents,
      warrantyEnabled,
      warrantyMonths,
      imagePath,
    });
  });

  return {
    catalog: { version: 1, items },
    catalogDir: dirname(catalogPath),
  };
}

function loadImageDataUrl(catalogDir: string, imagePath: string) {
  const absolutePath = isAbsolute(imagePath) ? imagePath : join(catalogDir, imagePath);
  const buffer = readFileSync(absolutePath);
  const extension = absolutePath.toLowerCase();

  let mime = "";

  if (extension.endsWith(".jpg") || extension.endsWith(".jpeg")) {
    mime = "image/jpeg";
  } else if (extension.endsWith(".png")) {
    mime = "image/png";
  } else if (extension.endsWith(".webp")) {
    mime = "image/webp";
  } else {
    throw new Error(`Unsupported image type for ${imagePath}. Use JPEG, PNG, or WebP.`);
  }

  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function unwrap<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }

  return body as T;
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  return { response, body };
}

function extractSessionCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) {
    return null;
  }

  const cookieName = process.env.SESSION_COOKIE_NAME?.trim() || "wizfield_session";

  return setCookieHeader
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.split(";")[0] ?? null;
}

async function createOwnerSessionCookie(dataSource: DataSource, userId: string) {
  const rawToken = randomBytes(48).toString("hex");
  const session = await dataSource.getRepository(AuthSessionEntity).save(
    dataSource.getRepository(AuthSessionEntity).create({
      session_token_hash: createHash("sha256").update(rawToken).digest("hex"),
      user_id: userId,
      active_organization_id: PHOENIX_ORG_ID,
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000),
      ip_address: "127.0.0.1",
      user_agent: "phoenix-pricebook-populate",
    }),
  );

  const cookieName = process.env.SESSION_COOKIE_NAME?.trim() || "wizfield_session";
  return { cookie: `${cookieName}=${rawToken}`, sessionId: session.id };
}

async function resolveOwnerCookie(dataSource: DataSource) {
  const ownerPassword = process.env.PHOENIX_OWNER_PASSWORD?.trim();

  if (ownerPassword) {
    const login = await fetchJson(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: PHOENIX_OWNER_EMAIL, password: ownerPassword }),
    });

    const cookie = extractSessionCookie(login.response.headers.get("set-cookie"));

    if (!cookie || !(login.response.status === 200 || login.response.status === 201)) {
      throw new Error(`Owner login failed for ${PHOENIX_OWNER_EMAIL} (HTTP ${login.response.status}).`);
    }

    return { cookie, sessionId: null as string | null };
  }

  const ownerRows = await dataSource.query(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [PHOENIX_OWNER_EMAIL],
  ) as Array<{ id: string }>;

  const ownerId = ownerRows[0]?.id;

  if (!ownerId) {
    throw new Error(`Phoenix owner user not found for ${PHOENIX_OWNER_EMAIL}.`);
  }

  return createOwnerSessionCookie(dataSource, ownerId);
}

async function api<T>(cookie: string, path: string, init?: RequestInit) {
  const { response, body } = await fetchJson(`${BASE}${path}`, {
    ...init,
    headers: {
      cookie,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = (body as { error?: { message?: string } } | null)?.error?.message
      ?? `HTTP ${response.status}`;
    throw new Error(message);
  }

  return unwrap<T>(body);
}

function buildCreatePayload(
  item: CatalogItem,
  systemId: string,
  categoryId: string,
  imageDataUrl: string | null,
) {
  return {
    systemId,
    categoryId,
    name: item.name,
    customerDescription: item.customerDescription,
    internalDescription: item.internalDescription,
    supplierName: item.supplierName,
    supplierSku: item.supplierSku,
    materialCostCents: item.materialCostCents,
    baseCostCents: 0,
    laborCostCents: 0,
    customerPriceCents: item.customerPriceCents,
    warrantyEnabled: item.warrantyEnabled,
    warrantyMonths: item.warrantyEnabled ? item.warrantyMonths : null,
    imageDataUrl,
    itemType: "product",
  };
}

function verifyReadBack(expected: CatalogItem, actual: PricebookItem) {
  const defects: string[] = [];
  const actualSystem = actual.system?.name ?? actual.category?.system?.name ?? null;
  const actualCategory = actual.category?.name ?? null;

  if (actualSystem !== expected.system) {
    defects.push(`system expected "${expected.system}" got "${actualSystem ?? "null"}"`);
  }

  if (actualCategory !== expected.category) {
    defects.push(`category expected "${expected.category}" got "${actualCategory ?? "null"}"`);
  }

  if (actual.name !== expected.name) {
    defects.push(`name mismatch`);
  }

  const expectedDescription = expected.customerDescription ?? null;
  const actualDescription = actual.customer_description ?? null;

  if (actualDescription !== expectedDescription) {
    defects.push(`customerDescription mismatch`);
  }

  if (actual.customer_price_cents !== expected.customerPriceCents) {
    defects.push(`customerPriceCents expected ${expected.customerPriceCents} got ${actual.customer_price_cents}`);
  }

  if (actual.material_cost_cents !== expected.materialCostCents) {
    defects.push(`materialCostCents expected ${expected.materialCostCents} got ${actual.material_cost_cents}`);
  }

  if ((actual.supplier_name ?? null) !== expected.supplierName) {
    defects.push(`supplierName expected "${expected.supplierName}" got "${actual.supplier_name ?? "null"}"`);
  }

  if ((actual.supplier_sku ?? null) !== expected.supplierSku) {
    defects.push(`supplierSku expected "${expected.supplierSku}" got "${actual.supplier_sku ?? "null"}"`);
  }

  const expectedInternalDescription = expected.internalDescription ?? null;

  if ((actual.internal_description ?? null) !== expectedInternalDescription) {
    defects.push("internalDescription mismatch");
  }

  const expectedWarranty = expected.warrantyEnabled ? expected.warrantyMonths : null;

  if ((actual.warranty_months ?? null) !== (expectedWarranty ?? null)) {
    defects.push(`warranty expected ${expectedWarranty ?? "null"} got ${actual.warranty_months ?? "null"}`);
  }

  if (expected.imagePath) {
    const expectedImageUrl = `/api/pricebook/items/${actual.id}/image`;

    if (actual.image_url !== expectedImageUrl) {
      defects.push(`image_url expected "${expectedImageUrl}" got "${actual.image_url ?? "null"}"`);
    }
  } else if (actual.image_url !== null) {
    defects.push(`image_url expected null got "${actual.image_url}"`);
  }

  return defects;
}

async function findExistingItem(
  cookie: string,
  systemId: string,
  categoryId: string,
  name: string,
) {
  let page = 1;

  while (page <= 100) {
    const result = await api<{ items: PricebookItem[]; totalCount: number; pageSize: number }>(
      cookie,
      `/api/pricebook/items?systemId=${encodeURIComponent(systemId)}&categoryId=${encodeURIComponent(categoryId)}&activeState=all&page=${page}&pageSize=100`,
    );

    const match = result.items.find((item) => item.name === name);

    if (match) {
      return match;
    }

    if (result.items.length < result.pageSize || page * result.pageSize >= result.totalCount) {
      return null;
    }

    page += 1;
  }

  return null;
}

function printCatalogDataset(items: CatalogItem[]) {
  const headers = [
    "#",
    "Category",
    "Item Name",
    "Supplier SKU",
    "Material Cost CAD",
    "Customer Price",
    "Warranty",
  ];
  const widths = headers.map((header) => header.length);
  const rows = items.map((item, index) => {
    const cells = [
      String(index + 1),
      item.category,
      item.name,
      item.supplierSku,
      formatCadFromCents(item.materialCostCents),
      formatCadFromCents(item.customerPriceCents),
      item.warrantyEnabled ? `${item.warrantyMonths} mo` : "OFF",
    ];

    cells.forEach((cell, cellIndex) => {
      widths[cellIndex] = Math.max(widths[cellIndex], cell.length);
    });

    return cells;
  });

  const line = (cells: string[]) => cells.map((cell, index) => cell.padEnd(widths[index])).join(" | ");

  console.log("");
  console.log("Approved catalog dataset:");
  console.log(line(headers));
  console.log(widths.map((width) => "-".repeat(width)).join("-|-"));

  for (const row of rows) {
    console.log(line(row));
  }

  const categoryCounts = items.reduce<Record<string, number>>((counts, item) => {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
    return counts;
  }, {});

  console.log("");
  console.log("Category breakdown:", JSON.stringify(categoryCounts, null, 2));
  console.log("");
  console.log("Pricing rules: materialCostCents = Fire-Parts purchase cost · customerPriceCents = $0 · warranty OFF/null");
}

function printAuditTable(rows: AuditRow[]) {
  const headers = ["Item", "System", "Category", "Create", "Read-back", "Result"];
  const widths = headers.map((header) => header.length);

  for (const row of rows) {
    widths[0] = Math.max(widths[0], row.item.length);
    widths[1] = Math.max(widths[1], row.system.length);
    widths[2] = Math.max(widths[2], row.category.length);
    widths[3] = Math.max(widths[3], row.create.length);
    widths[4] = Math.max(widths[4], row.readBack.length);
    widths[5] = Math.max(widths[5], row.result.length);
  }

  const line = (cells: string[]) => cells.map((cell, index) => cell.padEnd(widths[index])).join(" | ");

  console.log(line(headers));
  console.log(widths.map((width) => "-".repeat(width)).join("-|-"));

  for (const row of rows) {
    console.log(line([row.item, row.system, row.category, row.create, row.readBack, row.result]));

    if (row.detail) {
      console.log(`  -> ${row.detail}`);
    }
  }
}

async function main() {
  const { catalogPath, validateOnly } = parseArgs(process.argv.slice(2));
  const { catalog, catalogDir } = loadCatalog(catalogPath);

  console.log(JSON.stringify({
    mode: validateOnly ? "validate-only" : "populate",
    catalogPath,
    itemCount: catalog.items.length,
    organizationId: PHOENIX_ORG_ID,
  }, null, 2));

  if (validateOnly) {
    printCatalogDataset(catalog.items);
    console.log("Catalog validation PASS.");
    return;
  }

  const dataSource = new DataSource({ ...buildDataSourceOptions(), synchronize: false, logging: false });
  await dataSource.initialize();

  const auditRows: AuditRow[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let sessionId: string | null = null;

  try {
    const auth = await resolveOwnerCookie(dataSource);
    sessionId = auth.sessionId;

    const systemsResult = await api<{ systems: PricebookSystem[] }>(auth.cookie, "/api/pricebook/systems");
    const categoriesResult = await api<{ categories: PricebookCategory[] }>(auth.cookie, "/api/pricebook/categories");

    const systemByName = new Map(systemsResult.systems.map((system) => [system.name.toLowerCase(), system]));
    const categoriesBySystemAndName = new Map<string, PricebookCategory>();

    for (const category of categoriesResult.categories) {
      const system = systemsResult.systems.find((entry) => entry.id === category.system_id);
      const key = `${(system?.name ?? "").toLowerCase()}|${category.name.toLowerCase()}`;
      categoriesBySystemAndName.set(key, category);
    }

    for (const item of catalog.items) {
      const rowLabel = item.name.length > 48 ? `${item.name.slice(0, 45)}...` : item.name;

      try {
        const system = systemByName.get(item.system.toLowerCase());

        if (!system) {
          throw new Error(`System "${item.system}" is not in Phoenix Pricebook. Run phoenix:pricebook:bootstrap first.`);
        }

        const category = categoriesBySystemAndName.get(`${item.system.toLowerCase()}|${item.category.toLowerCase()}`);

        if (!category) {
          throw new Error(`Category "${item.category}" was not found under system "${item.system}".`);
        }

        const existing = await findExistingItem(auth.cookie, system.id, category.id, item.name);

        if (existing) {
          const defects = verifyReadBack(item, existing);

          if (defects.length > 0) {
            failed += 1;
            auditRows.push({
              item: rowLabel,
              system: item.system,
              category: item.category,
              create: "SKIPPED",
              readBack: "FAIL",
              result: "FAIL",
              detail: `Existing item ${existing.id} failed read-back verification: ${defects.join("; ")}`,
            });
            break;
          }

          skipped += 1;
          auditRows.push({
            item: rowLabel,
            system: item.system,
            category: item.category,
            create: "SKIPPED",
            readBack: "PASS",
            result: "SKIPPED",
            detail: `Existing item ${existing.id}`,
          });
          continue;
        }

        const imageDataUrl = item.imagePath ? loadImageDataUrl(catalogDir, item.imagePath) : null;
        const createdItem = await api<PricebookItem>(
          auth.cookie,
          "/api/pricebook/items",
          {
            method: "POST",
            body: JSON.stringify(buildCreatePayload(item, system.id, category.id, imageDataUrl)),
          },
        );

        const readBack = await api<PricebookItem>(
          auth.cookie,
          `/api/pricebook/items/${createdItem.id}`,
        );

        const defects = verifyReadBack(item, readBack);

        if (defects.length > 0) {
          failed += 1;
          auditRows.push({
            item: rowLabel,
            system: item.system,
            category: item.category,
            create: "CREATED",
            readBack: "FAIL",
            result: "FAIL",
            detail: `${createdItem.id}: ${defects.join("; ")}`,
          });
          break;
        }

        created += 1;
        auditRows.push({
          item: rowLabel,
          system: item.system,
          category: item.category,
          create: "CREATED",
          readBack: "PASS",
          result: "PASS",
          detail: createdItem.id,
        });
      } catch (error) {
        failed += 1;
        auditRows.push({
          item: rowLabel,
          system: item.system,
          category: item.category,
          create: "FAILED",
          readBack: "—",
          result: "FAIL",
          detail: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }

    const finalCount = await api<{ totalCount: number }>(
      auth.cookie,
      "/api/pricebook/items?activeState=all&page=1&pageSize=1",
    );

    console.log("");
    printAuditTable(auditRows);
    console.log("");
    console.log(JSON.stringify({
      attempted: catalog.items.length,
      created,
      skippedExisting: skipped,
      failed,
      stoppedEarly: failed > 0,
      finalPricebookItemCount: finalCount.totalCount,
      overall: failed > 0 ? "FAIL" : "PASS",
    }, null, 2));

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (sessionId) {
      await dataSource.getRepository(AuthSessionEntity).delete({ id: sessionId });
    }

    await dataSource.destroy();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
