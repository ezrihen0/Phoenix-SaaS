/**
 * Phoenix Gas Pricebook → Inventory UI dogfooding runner.
 * Reads each Gas pricebook item from /pricebook, then creates or verifies
 * the linked inventory record through /inventory (Add item / Edit item).
 * No direct inventory API calls and no database seeding from this file.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const CATALOG_PATH = resolve(ROOT, "backend/data/phoenix-pricebook-catalog.json");
const ENV_PATH = resolve(ROOT, "backend/.env");
const DEFAULT_STORAGE_STATE = resolve(__dirname, "../.phoenix-ui-auth.json");
const BASE_URL = process.env.WIZFIELD_UI_BASE_URL?.trim() || "http://localhost:3000";
const COUPON_CODE = process.env.PHOENIX_BILLING_COUPON_CODE?.trim() || "PHOENIXFIREPLACE0";
const NAV_WAIT = "domcontentloaded";

function parseArgs(argv) {
  const options = {
    headed: false,
    manualLogin: false,
    storageState: process.env.WIZFIELD_UI_STORAGE_STATE?.trim() || "",
    saveStorageState: "",
    skipCoupon: false,
    limit: 0,
  };

  for (const arg of argv) {
    if (arg === "--headed") {
      options.headed = true;
      continue;
    }

    if (arg === "--manual-login") {
      options.manualLogin = true;
      options.headed = true;
      continue;
    }

    if (arg === "--skip-coupon") {
      options.skipCoupon = true;
      continue;
    }

    if (arg.startsWith("--storage-state=")) {
      options.storageState = arg.slice("--storage-state=".length).trim();
      continue;
    }

    if (arg.startsWith("--save-storage-state=")) {
      options.saveStorageState = arg.slice("--save-storage-state=".length).trim();
      continue;
    }

    if (arg.startsWith("--limit=")) {
      options.limit = Number.parseInt(arg.slice("--limit=".length), 10) || 0;
    }
  }

  if (!options.storageState && existsSync(DEFAULT_STORAGE_STATE)) {
    options.storageState = DEFAULT_STORAGE_STATE;
  }

  return options;
}

function loadEnvFile(path) {
  const values = {};

  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("$")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      if (!/^[A-Z0-9_]+$/u.test(key)) continue;
      values[key] = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    }
  } catch {
    return values;
  }

  return values;
}

function centsToInput(cents) {
  return (cents / 100).toFixed(2);
}

function parseCurrencyToCents(value) {
  const trimmed = String(value ?? "").trim().replace(/[^0-9.-]/gu, "");
  if (!trimmed) return null;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function loadCatalog() {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  if (!Array.isArray(catalog.items) || catalog.items.length !== 37) {
    throw new Error(`Expected 37 approved Gas catalog items, got ${catalog.items?.length ?? 0}.`);
  }
  return catalog.items;
}

async function login(page, email, password) {
  await page.goto(`${BASE_URL}/login?next=/pricebook`, { waitUntil: NAV_WAIT });
  await page.getByPlaceholder("you@company.com").fill(email);
  await page.getByPlaceholder("Enter your password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => new URL(String(url)).pathname !== "/login", { timeout: 60_000 });
}

async function gotoApp(page, path) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: NAV_WAIT });
  await page.waitForTimeout(400);
}

async function ensureBusinessPlan(page) {
  await gotoApp(page, "/settings?topic=billing");
  const planCell = page.locator("dt").filter({ hasText: /^Plan$/u }).locator("xpath=following-sibling::dd[1]");
  const planText = ((await planCell.textContent()) ?? "").trim().toLowerCase();

  if (planText === "business") {
    return "already_business";
  }

  await page.getByPlaceholder("PHOENIXFIREPLACE0").fill(COUPON_CODE);
  await page.getByRole("button", { name: "Apply coupon" }).click();
  await page.waitForTimeout(1500);

  const success = page.getByText("Business plan access is now active for this billing account.");
  if (await success.count()) {
    return "coupon_applied";
  }

  const planAfter = ((await planCell.textContent()) ?? "").trim().toLowerCase();
  if (planAfter === "business") {
    return "coupon_applied";
  }

  throw new Error("Business plan is required for inventory catalog management. Coupon application did not succeed.");
}

async function openPricebookItemInspector(page, catalogItem) {
  await gotoApp(page, "/pricebook");
  await page.getByRole("region", { name: "Service catalog" }).waitFor({ timeout: 20_000 });

  const gasButton = page.locator("button").filter({ has: page.getByText("Gas", { exact: true }) }).first();
  await gasButton.click();
  await page.waitForURL((url) => String(url).includes("systemId="), { timeout: 15_000 });

  await page.getByPlaceholder("SKU, name, description, tag").fill(catalogItem.supplierSku);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await page.waitForTimeout(900);

  const row = page.locator(".crm-table-frame tbody tr").filter({ hasText: catalogItem.name }).first();
  await row.waitFor({ state: "visible", timeout: 20_000 });
  await row.click();

  const inspector = page.locator("aside").filter({ hasText: "Catalog inspector" });
  await inspector.waitFor({ state: "visible", timeout: 15_000 });
  await inspector.getByRole("heading", { name: catalogItem.name, exact: true }).waitFor({ timeout: 15_000 });

  const sku = (await inspector.locator("p.font-\\[family\\:var\\(--font-geist-mono\\)\\]").first().textContent())?.trim() ?? "";
  const text = await inspector.innerText();
  const materialCostCents = parseCurrencyToCents(text.match(/Material cost[\s\S]*?(\$[\d,]+\.\d{2})/u)?.[1] ?? "");
  const supplierName = catalogItem.supplierName;
  const supplierSku = catalogItem.supplierSku;

  if (!sku) {
    throw new Error(`Could not read pricebook internal SKU for ${catalogItem.name}.`);
  }

  if (materialCostCents == null || materialCostCents !== catalogItem.materialCostCents) {
    throw new Error(
      `Pricebook material cost mismatch for ${catalogItem.name}: UI=${materialCostCents}, catalog=${catalogItem.materialCostCents}.`,
    );
  }

  if (!text.includes(supplierName) || !text.includes(supplierSku)) {
    throw new Error(`Pricebook supplier fields missing in inspector for ${catalogItem.name}.`);
  }

  await inspector.getByRole("button").filter({ has: page.locator("svg") }).first().click();

  return {
    internalSku: sku,
    name: catalogItem.name,
    materialCostCents,
    supplierName,
    supplierSku,
  };
}

async function searchInventoryCatalog(page, query) {
  await gotoApp(page, "/inventory");
  await page.getByRole("heading", { name: "Inventory Control Desk" }).waitFor({ timeout: 20_000 });

  const entitlementError = page.getByText("Inventory management is available on the Business plan");
  if (await entitlementError.count()) {
    throw new Error("Inventory catalog is blocked by Business plan entitlement.");
  }

  const search = page.getByPlaceholder("SKU, item, supplier, location");
  await search.fill(query);
  await page.waitForTimeout(500);
}

async function readInventoryCatalogRow(page, internalSku) {
  const row = page.locator("section").filter({ hasText: "Catalog management" }).locator("tbody tr").filter({ hasText: internalSku }).first();
  if (await row.count() === 0) {
    return null;
  }

  const cells = row.locator("td");
  const sku = (await cells.nth(0).textContent())?.trim() ?? "";
  const name = (await cells.nth(1).textContent())?.trim() ?? "";
  const defaultCost = (await cells.nth(4).textContent())?.trim() ?? "";
  const supplier = (await cells.nth(5).textContent())?.trim() ?? "";

  return {
    internalSku: sku,
    name,
    defaultCostCents: parseCurrencyToCents(defaultCost),
    supplierName: supplier === "-" ? "" : supplier,
    supplierSku: "",
  };
}

function inventoryModal(page, title) {
  return page.getByRole("heading", { name: title, exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-[32px]')][1]");
}

async function readInventoryDetailsFromEdit(page, internalSku, attempt = 1) {
  await searchInventoryCatalog(page, internalSku);
  const row = page.locator("section").filter({ hasText: "Catalog management" }).locator("tbody tr").filter({ hasText: internalSku }).first();
  if (await row.count() === 0) {
    return null;
  }

  await row.scrollIntoViewIfNeeded();
  await row.getByRole("button", { name: "Edit" }).click();
  const modal = inventoryModal(page, "Edit inventory item");

  try {
    await modal.waitFor({ state: "visible", timeout: 15_000 });
  } catch (error) {
    if (attempt < 2) {
      await page.keyboard.press("Escape").catch(() => {});
      return readInventoryDetailsFromEdit(page, internalSku, attempt + 1);
    }
    throw error;
  }

  const values = await modal.locator("input:not([type='checkbox'])").evaluateAll((nodes) => nodes.map((node) => node.value.trim()));
  if (!values[0] && attempt < 2) {
    await modal.getByRole("button", { name: "Close" }).click().catch(() => {});
    return readInventoryDetailsFromEdit(page, internalSku, attempt + 1);
  }

  const details = {
    internalSku: values[0] ?? "",
    name: values[1] ?? "",
    defaultCostCents: parseCurrencyToCents(values[2] ?? ""),
    supplierName: values[6] ?? "",
    supplierSku: values[7] ?? "",
  };

  await modal.getByRole("button", { name: "Close" }).click();
  await page.waitForTimeout(300);

  return details.internalSku ? details : null;
}

async function createInventoryItemThroughUi(page, pricebook) {
  await searchInventoryCatalog(page, pricebook.internalSku);

  await page.getByRole("button", { name: "Add item" }).first().click();
  const modal = inventoryModal(page, "Add inventory item");
  await modal.waitFor({ state: "visible", timeout: 15_000 });

  const fillByLabel = async (label, value) => {
    const input = modal.locator("label").filter({ hasText: label }).locator("input, textarea").first();
    await input.fill(value);
  };

  await fillByLabel("Internal SKU", pricebook.internalSku);
  await fillByLabel("Item name", pricebook.name);
  await fillByLabel("Default cost before tax", centsToInput(pricebook.materialCostCents));
  await fillByLabel("Supplier name", pricebook.supplierName);
  await fillByLabel("Supplier SKU", pricebook.supplierSku);
  await fillByLabel("Notes", `Linked from Gas pricebook item ${pricebook.internalSku}.`);

  await modal.getByRole("button", { name: "Create item" }).click();
  await page.waitForTimeout(800);

  const errorBanner = page.locator(".text-rose-100").filter({ hasText: /.+/u });
  if (await errorBanner.count()) {
    throw new Error(await errorBanner.first().innerText());
  }

  await page.keyboard.press("Escape").catch(() => {});
  await gotoApp(page, "/inventory");
}

async function fixInventoryItemThroughUi(page, pricebook, existingSku) {
  await searchInventoryCatalog(page, existingSku);
  const row = page.locator("section").filter({ hasText: "Catalog management" }).locator("tbody tr").filter({ hasText: existingSku }).first();
  await row.getByRole("button", { name: "Edit" }).click();

  const modal = inventoryModal(page, "Edit inventory item");
  await modal.waitFor({ state: "visible", timeout: 15_000 });

  const setField = async (label, value) => {
    const input = modal.locator("label").filter({ hasText: label }).locator("input, textarea").first();
    await input.fill(value);
  };

  if (existingSku !== pricebook.internalSku) {
    await setField("Internal SKU", pricebook.internalSku);
  }

  await setField("Item name", pricebook.name);
  await setField("Default cost before tax", centsToInput(pricebook.materialCostCents));
  await setField("Supplier name", pricebook.supplierName);
  await setField("Supplier SKU", pricebook.supplierSku);

  await modal.getByRole("button", { name: "Save item" }).click();
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape").catch(() => {});
  await gotoApp(page, "/inventory");
}

function verifyInventoryMatchesPricebook(pricebook, inventoryRow) {
  const issues = [];

  if (inventoryRow.internalSku !== pricebook.internalSku) {
    issues.push(`SKU link expected ${pricebook.internalSku}, got ${inventoryRow.internalSku}`);
  }

  if (inventoryRow.name !== pricebook.name) {
    issues.push(`name expected ${pricebook.name}, got ${inventoryRow.name}`);
  }

  if (inventoryRow.defaultCostCents !== pricebook.materialCostCents) {
    issues.push(`cost expected ${pricebook.materialCostCents}, got ${inventoryRow.defaultCostCents}`);
  }

  if ((inventoryRow.supplierName ?? "") !== pricebook.supplierName) {
    issues.push(`supplier expected ${pricebook.supplierName}, got ${inventoryRow.supplierName}`);
  }

  if (inventoryRow.supplierSku && inventoryRow.supplierSku !== pricebook.supplierSku) {
    issues.push(`supplier SKU expected ${pricebook.supplierSku}, got ${inventoryRow.supplierSku}`);
  }

  return issues;
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const env = loadEnvFile(ENV_PATH);
  const email = (process.env.PHOENIX_OWNER_EMAIL || env.PHOENIX_OWNER_EMAIL || "phoenixfireplace0@gmail.com").trim().toLowerCase();
  const password = process.env.PHOENIX_OWNER_PASSWORD?.trim() || env.PHOENIX_OWNER_PASSWORD?.trim();
  const hasStorageState = Boolean(cli.storageState && existsSync(cli.storageState));
  const canPasswordLogin = Boolean(password && password !== "<set-in-local-env-only>");

  if (!hasStorageState && !canPasswordLogin && !cli.manualLogin) {
    throw new Error("Phoenix owner authentication is required. Set PHOENIX_OWNER_PASSWORD or use --storage-state.");
  }

  const catalogItems = loadCatalog().slice(0, cli.limit > 0 ? cli.limit : undefined);
  const { chromium } = await import("playwright");

  console.error(`Starting Gas inventory UI entry for ${catalogItems.length} catalog items…`);

  const browser = await chromium.launch({ headless: !cli.headed });
  const context = await browser.newContext({
    ...(hasStorageState ? { storageState: cli.storageState } : {}),
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();

  const audit = [];
  let created = 0;
  let existingVerified = 0;
  let fixed = 0;
  let failed = 0;

  try {
    if (hasStorageState) {
      await gotoApp(page, "/pricebook");
    } else if (cli.manualLogin) {
      await page.goto(`${BASE_URL}/login?next=/pricebook`, { waitUntil: NAV_WAIT });
      console.error(`Manual login as ${email}, then wait…`);
      await page.waitForURL((url) => new URL(String(url)).pathname !== "/login", { timeout: 300_000 });
      const savePath = cli.saveStorageState || DEFAULT_STORAGE_STATE;
      await context.storageState({ path: savePath });
      console.error(`Saved UI session to ${savePath}`);
    } else {
      await login(page, email, password);
    }

    if (!cli.skipCoupon) {
      await ensureBusinessPlan(page);
    }

    for (const catalogItem of catalogItems) {
      console.error(`Processing: ${catalogItem.name} (${catalogItem.supplierSku})`);
      const row = {
        pricebookItem: catalogItem.name,
        sku: "—",
        pricebookCost: centsToInput(catalogItem.materialCostCents),
        inventoryItem: "—",
        inventoryCost: "—",
        link: "—",
        result: "FAILED",
        detail: "",
      };

      try {
        const pricebook = await openPricebookItemInspector(page, catalogItem);
        row.sku = pricebook.internalSku;
        row.pricebookCost = centsToInput(pricebook.materialCostCents);

        await searchInventoryCatalog(page, pricebook.supplierSku);
        let inventoryRow = await readInventoryCatalogRow(page, pricebook.internalSku);

        if (!inventoryRow) {
          const altBySupplier = page.locator("section").filter({ hasText: "Catalog management" }).locator("tbody tr").filter({ hasText: catalogItem.name }).first();
          if (await altBySupplier.count()) {
            const altSku = (await altBySupplier.locator("td").first().textContent())?.trim() ?? "";
            inventoryRow = await readInventoryCatalogRow(page, altSku);
          }
        }

        if (!inventoryRow) {
          await createInventoryItemThroughUi(page, pricebook);
          inventoryRow = await readInventoryDetailsFromEdit(page, pricebook.internalSku);

          if (!inventoryRow) {
            throw new Error("Inventory item was not visible in catalog after UI create.");
          }

          row.inventoryItem = inventoryRow.name;
          row.inventoryCost = centsToInput(inventoryRow.defaultCostCents ?? 0);
          row.link = inventoryRow.internalSku === pricebook.internalSku ? "SKU" : "MISMATCH";
          row.result = "CREATED";
          created += 1;
          audit.push(row);
          continue;
        }

        const detailedInventory = await readInventoryDetailsFromEdit(page, inventoryRow.internalSku);
        if (detailedInventory?.internalSku) {
          inventoryRow = detailedInventory;
        }

        row.inventoryItem = inventoryRow.name;
        row.inventoryCost = centsToInput(inventoryRow.defaultCostCents ?? 0);
        row.link = inventoryRow.internalSku === pricebook.internalSku ? "SKU" : "MISMATCH";

        const issues = verifyInventoryMatchesPricebook(pricebook, inventoryRow);
        if (issues.length > 0) {
          await fixInventoryItemThroughUi(page, pricebook, inventoryRow.internalSku);
          inventoryRow = await readInventoryDetailsFromEdit(page, pricebook.internalSku);

          if (!inventoryRow) {
            throw new Error("Inventory item missing after UI fix.");
          }

          const remaining = verifyInventoryMatchesPricebook(pricebook, inventoryRow);
          if (remaining.length > 0) {
            throw new Error(remaining.join("; "));
          }

          row.inventoryItem = inventoryRow.name;
          row.inventoryCost = centsToInput(inventoryRow.defaultCostCents ?? 0);
          row.link = "SKU";
          row.result = "FIXED";
          fixed += 1;
          audit.push(row);
          continue;
        }

        row.result = "EXISTING VERIFIED";
        existingVerified += 1;
        audit.push(row);
      } catch (error) {
        failed += 1;
        row.detail = error instanceof Error ? error.message : String(error);
        audit.push(row);
        console.error(`FAILED: ${catalogItem.name} — ${row.detail}`);
      }
    }

    const summary = {
      audit,
      created,
      existingVerified,
      fixed,
      failed,
      stoppedEarly: failed > 0,
      overall: failed > 0 ? "FAIL" : "PASS",
    };

    console.log(JSON.stringify(summary, null, 2));
    console.log("");
    console.log("Pricebook Item | SKU | Pricebook Cost | Inventory Item | Inventory Cost | Link | Result");
    for (const entry of audit) {
      console.log(
        `${entry.pricebookItem} | ${entry.sku} | ${entry.pricebookCost} | ${entry.inventoryItem} | ${entry.inventoryCost} | ${entry.link} | ${entry.result}${entry.detail ? ` (${entry.detail})` : ""}`,
      );
    }

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
