/**
 * Phoenix Gas Pricebook V1 — UI entry dogfooding runner.
 * Drives the real WizField frontend (login → /pricebook/new → Create Item).
 * NOT the backend populate script; no direct API calls from this file.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const CATALOG_PATH = resolve(ROOT, "backend/data/phoenix-pricebook-catalog.json");
const ENV_PATH = resolve(ROOT, "backend/.env");
const DEFAULT_STORAGE_STATE = resolve(__dirname, "../.phoenix-ui-auth.json");
const BASE_URL = process.env.WIZFIELD_UI_BASE_URL?.trim() || "http://localhost:3000";

function parseArgs(argv) {
  const options = {
    headed: false,
    manualLogin: false,
    storageState: process.env.WIZFIELD_UI_STORAGE_STATE?.trim() || "",
    saveStorageState: "",
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

    if (arg.startsWith("--storage-state=")) {
      options.storageState = arg.slice("--storage-state=".length).trim();
      continue;
    }

    if (arg.startsWith("--save-storage-state=")) {
      options.saveStorageState = arg.slice("--save-storage-state=".length).trim();
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

      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("$")) {
        continue;
      }

      const index = trimmed.indexOf("=");

      if (index === -1) {
        continue;
      }

      const key = trimmed.slice(0, index).trim();

      if (!/^[A-Z0-9_]+$/u.test(key)) {
        continue;
      }

      values[key] = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    }
  } catch {
    return values;
  }

  return values;
}

function centsToCadInput(cents) {
  return (cents / 100).toFixed(2);
}

function loadCatalog() {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));

  if (!Array.isArray(catalog.items) || catalog.items.length !== 37) {
    throw new Error(`Expected 37 approved catalog items, got ${catalog.items?.length ?? 0}.`);
  }

  return catalog.items;
}

function isPricebookPath(urlString) {
  const path = new URL(urlString).pathname;
  return path === "/pricebook" || path.startsWith("/pricebook/");
}

async function waitForPricebook(page, timeoutMs) {
  await page.waitForURL((url) => isPricebookPath(String(url)), { timeout: timeoutMs });
}

async function waitForAuthenticated(page, timeoutMs) {
  await page.waitForURL((url) => new URL(String(url)).pathname !== "/login", { timeout: timeoutMs });
}

async function ensurePricebookReady(page) {
  if (!isPricebookPath(page.url())) {
    await page.goto(`${BASE_URL}/pricebook`, { waitUntil: "networkidle" });
  }

  await assertPricebookSession(page);
}

async function assertPricebookSession(page) {
  await page.goto(`${BASE_URL}/pricebook`, { waitUntil: "networkidle" });

  if (!isPricebookPath(page.url())) {
    throw new Error("Saved UI session is expired. Re-authenticate and refresh the storage state file.");
  }

  await page.getByRole("region", { name: "Service catalog" }).waitFor({ timeout: 20_000 });
}

async function login(page, email, password) {
  await page.goto(`${BASE_URL}/login?next=/pricebook`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("you@company.com").fill(email);
  await page.getByPlaceholder("Enter your password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await waitForAuthenticated(page, 60_000);
  await ensurePricebookReady(page);
}

async function manualLogin(page, email) {
  await page.goto(`${BASE_URL}/login?next=/pricebook`, { waitUntil: "networkidle" });
  console.error(
    `Manual login: sign in as ${email} in the opened browser. After sign-in you may land on /home; the runner will open Pricebook automatically.`,
  );
  await waitForAuthenticated(page, 300_000);
  await ensurePricebookReady(page);
}

async function findExistingItemRow(page, item) {
  await page.goto(`${BASE_URL}/pricebook`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("SKU, name, description, tag").fill(item.supplierSku);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await page.waitForTimeout(800);

  const row = page.locator(".crm-table-frame tbody tr").filter({ hasText: item.name }).first();
  const count = await row.count();

  if (count === 0) {
    return null;
  }

  return row;
}

async function verifyItemInPricebookUi(page, item) {
  await page.goto(`${BASE_URL}/pricebook`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("SKU, name, description, tag").fill(item.supplierSku);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await page.waitForTimeout(1000);

  const row = page.locator(".crm-table-frame tbody tr").filter({ hasText: item.name }).first();
  await row.waitFor({ state: "visible", timeout: 20_000 });
  await row.click();
  await verifyInspector(page, item);
}

async function verifyInspector(page, item) {
  const inspector = page.locator("aside").filter({ hasText: "Catalog inspector" });
  await inspector.waitFor({ state: "visible", timeout: 15_000 });
  await inspector.getByRole("heading", { name: item.name, exact: true }).waitFor({ timeout: 15_000 });
  const text = await inspector.innerText();

  const expectedMaterial = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(item.materialCostCents / 100);
  const expectedCustomer = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(0);

  const checks = [
    ["Vendor / supplier", item.supplierName],
    ["Supplier SKU", item.supplierSku],
    ["Material cost", expectedMaterial],
    ["Customer price", expectedCustomer],
    ["Warranty", "No warranty set"],
    ["System", item.system],
  ];

  for (const [label, expected] of checks) {
    if (!text.includes(label) || !text.includes(expected)) {
      throw new Error(`Inspector verification failed for ${item.name}: expected ${label}=${expected}`);
    }
  }

  if (!text.includes(item.category)) {
    throw new Error(`Inspector verification failed for ${item.name}: category ${item.category} not found`);
  }
}

async function createItemThroughUi(page, item) {
  await page.goto(`${BASE_URL}/pricebook/new`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Add New Item" }).waitFor({ timeout: 15_000 });

  await page.getByRole("combobox", { name: /^System/u }).selectOption({ label: item.system });

  const categorySelect = page.getByRole("combobox", { name: /^Category/u });
  await categorySelect.waitFor({ state: "visible", timeout: 10_000 });
  await categorySelect.selectOption({ label: item.category });

  await page.getByRole("textbox", { name: /^Item Name/u }).fill(item.name);

  const description = item.customerDescription?.trim?.() ?? "";
  if (description) {
    await page.getByRole("textbox", { name: /^Customer Description/u }).fill(description);
  }

  await page.getByRole("textbox", { name: /^Customer Price/u }).fill(centsToCadInput(item.customerPriceCents));
  await page.getByRole("textbox", { name: /^Material \/ Purchase Cost/u }).fill(centsToCadInput(item.materialCostCents));
  await page.getByPlaceholder("Fire-Parts").fill(item.supplierName);
  await page.getByPlaceholder("FP9903").fill(item.supplierSku);

  await page.getByRole("button", { name: "Create Item" }).click();
  await page.waitForURL(/\/pricebook\/[0-9a-f-]+/u, { timeout: 30_000 });
  await verifyItemInPricebookUi(page, item);
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const env = loadEnvFile(ENV_PATH);
  const email = (process.env.PHOENIX_OWNER_EMAIL || env.PHOENIX_OWNER_EMAIL || "phoenixfireplace0@gmail.com").trim().toLowerCase();
  const password = process.env.PHOENIX_OWNER_PASSWORD?.trim() || env.PHOENIX_OWNER_PASSWORD?.trim();
  const hasStorageState = Boolean(cli.storageState && existsSync(cli.storageState));
  const canPasswordLogin = Boolean(password && password !== "<set-in-local-env-only>");

  if (!hasStorageState && !canPasswordLogin && !cli.manualLogin) {
    throw new Error(
      "Phoenix owner authentication is required for UI entry. "
      + "Set PHOENIX_OWNER_PASSWORD in backend/.env, pass --storage-state=path to a saved Playwright session, "
      + "or run once with --manual-login --save-storage-state=frontend/.phoenix-ui-auth.json.",
    );
  }

  const catalogItems = loadCatalog();
  const { chromium } = await import("playwright");

  const browser = await chromium.launch({ headless: !cli.headed });
  const context = await browser.newContext({
    ...(hasStorageState ? { storageState: cli.storageState } : {}),
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();

  const audit = [];
  let created = 0;
  let existingVerified = 0;
  let failed = 0;
  const defectsFixed = [
    "Add New Item form (/pricebook/new) lacked Material/Purchase Cost, Supplier, and Supplier SKU fields required for Phoenix V1 catalog entry.",
    "UI entry runner treated login?next=/pricebook as a successful redirect; login now waits for pathname /pricebook.",
    "Add-item label locator matched Material/Purchase Cost note text containing 'customer price'; form fields now use accessible roles and placeholders.",
    "Pricebook search ignored supplier SKU/name; catalog filter now matches Fire-Parts supplier fields.",
    "UI verification targeted the wrong aside panel; inspector checks now scope to Catalog inspector.",
  ];

  try {
    if (hasStorageState) {
      await assertPricebookSession(page);
    } else if (cli.manualLogin) {
      await manualLogin(page, email);
      const savePath = cli.saveStorageState || DEFAULT_STORAGE_STATE;
      await context.storageState({ path: savePath });
      console.error(`Saved UI session to ${savePath}`);
    } else {
      await login(page, email, password);
    }

    for (const item of catalogItems) {
      const row = {
        item: item.name,
        category: item.category,
        uiCreate: "—",
        uiVerification: "—",
        result: "FAILED",
        detail: "",
      };

      try {
        const existingRow = await findExistingItemRow(page, item);

        if (existingRow) {
          await existingRow.click();
          await verifyInspector(page, item);
          row.uiCreate = "SKIPPED";
          row.uiVerification = "PASS";
          row.result = "EXISTING VERIFIED";
          existingVerified += 1;
          audit.push(row);
          continue;
        }

        await createItemThroughUi(page, item);
        row.uiCreate = "CREATED";
        row.uiVerification = "PASS";
        row.result = "CREATED";
        created += 1;
        audit.push(row);
      } catch (error) {
        failed += 1;
        row.detail = error instanceof Error ? error.message : String(error);
        audit.push(row);
        break;
      }
    }

    await page.goto(`${BASE_URL}/pricebook`, { waitUntil: "networkidle" });
    const summaryText = await page.getByText(/showing \d+ of \d+ filtered items/u).first().innerText();
    const totalMatch = summaryText.match(/of (\d+) filtered items/u);
    const finalCount = totalMatch ? Number(totalMatch[1]) : null;

    console.log(JSON.stringify({
      audit,
      created,
      existingVerified,
      failed,
      stoppedEarly: failed > 0,
      defectsDiscovered: defectsFixed.length,
      defectsFixed,
      finalPricebookCountText: summaryText,
      finalFilteredCount: finalCount,
      overall: failed > 0 ? "FAIL" : "PASS",
    }, null, 2));

    console.log("");
    console.log("UI Entry Audit");
    console.log("Item | Category | UI Create | UI Verification | Result");
    for (const row of audit) {
      console.log(`${row.item} | ${row.category} | ${row.uiCreate} | ${row.uiVerification} | ${row.result}${row.detail ? ` (${row.detail})` : ""}`);
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
