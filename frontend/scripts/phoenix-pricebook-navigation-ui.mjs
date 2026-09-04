/**
 * Phoenix Pricebook navigation hierarchy UI verification.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const ENV_PATH = resolve(ROOT, "backend/.env");
const BASE_URL = process.env.WIZFIELD_UI_BASE_URL?.trim() || "http://localhost:3000";

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

function isPricebookPath(urlString) {
  const path = new URL(urlString).pathname;
  return path === "/pricebook" || path.startsWith("/pricebook/");
}

async function login(page, email, password) {
  await page.goto(`${BASE_URL}/login?next=/pricebook`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("you@company.com").fill(email);
  await page.getByPlaceholder("Enter your password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => new URL(String(url)).pathname !== "/login", { timeout: 60_000 });
  await page.goto(`${BASE_URL}/pricebook`, { waitUntil: "networkidle" });
  await page.getByRole("region", { name: "Service catalog" }).waitFor({ timeout: 20_000 });
}

async function folderButton(page, title) {
  return page.locator("button").filter({ has: page.getByText(title, { exact: true }) }).first();
}

async function folderCount(page, title) {
  const button = await folderButton(page, title);
  await button.waitFor({ state: "visible", timeout: 15_000 });
  const text = await button.innerText();
  const match = text.match(/(\d+)\s*\r?\n[^\n]*category/iu);
  if (match) {
    return Number.parseInt(match[1], 10);
  }

  const lines = text.split(/\r?\n/u).map((line) => line.trim());
  const countLine = lines.find((line) => /^\d+$/u.test(line));
  return countLine ? Number.parseInt(countLine, 10) : null;
}

async function runChecks(page, label) {
  const checks = [];
  const catalogSurface = page.getByRole("region", { name: "Service catalog" });

  await catalogSurface.getByText("Catalog navigation").waitFor({ timeout: 15_000 });
  checks.push([`${label} · navigation lives in service catalog`, true]);

  const rootHasPilot = await catalogSurface.locator("button").filter({ has: page.getByText("Pilot Assemblies", { exact: true }) }).count();
  checks.push([`${label} · Root hides Gas categories`, rootHasPilot === 0]);

  const gasCount = await folderCount(page, "Gas");
  checks.push([`${label} · Gas system visible at root`, gasCount != null && gasCount >= 37]);

  await (await folderButton(page, "Gas")).click();
  await page.waitForURL((url) => String(url).includes("systemId="), { timeout: 15_000 });
  checks.push([`${label} · Opening Gas sets system filter`, String(page.url()).includes("systemId=")]);

  const pilotVisible = await catalogSurface.locator("button").filter({ has: page.getByText("Pilot Assemblies", { exact: true }) }).count();
  checks.push([`${label} · Gas categories visible under Gas`, pilotVisible > 0]);

  const pilotCount = await folderCount(page, "Pilot Assemblies");
  checks.push([`${label} · Pilot Assemblies count reflects catalog items`, pilotCount != null && pilotCount >= 11]);

  const woodVisible = await catalogSurface.locator("button").filter({ has: page.getByText("Wood", { exact: true }) }).count();
  checks.push([`${label} · Wood is not shown as Gas category`, woodVisible === 0]);

  await (await folderButton(page, "Pilot Assemblies")).click();
  await page.waitForURL((url) => String(url).includes("categoryId="), { timeout: 15_000 });
  checks.push([`${label} · Opening category sets category filter`, String(page.url()).includes("categoryId=")]);

  await catalogSurface.getByPlaceholder("SKU, name, description, tag").fill("FP9903");
  await catalogSurface.getByRole("button", { name: "Apply filters" }).click();
  await page.waitForTimeout(1200);
  const rowVisible = await catalogSurface.locator(".crm-table-frame tbody tr, article").filter({ hasText: "SIT Top Mount Pilot Assembly (Natural Gas)" }).count();
  checks.push([`${label} · Category view shows FP9903 item`, rowVisible > 0]);

  await catalogSurface.getByRole("navigation", { name: "Pricebook hierarchy" }).getByRole("button", { name: "Pricebook" }).click();
  await page.waitForURL((url) => !String(url).includes("systemId=") && !String(url).includes("categoryId="), { timeout: 15_000 });
  checks.push([`${label} · Breadcrumb Pricebook returns to root`, isPricebookPath(page.url()) && !page.url().includes("systemId=")]);

  const woodAtRoot = await (await folderButton(page, "Wood")).count();
  const generalAtRoot = await (await folderButton(page, "General")).count();
  checks.push([`${label} · Wood remains a separate system`, woodAtRoot === 1]);
  checks.push([`${label} · General remains a separate system`, generalAtRoot === 1]);

  const filterOrder = await catalogSurface.evaluate((node) => {
    const text = node.innerText.toUpperCase();
    const navIndex = text.indexOf("CATALOG NAVIGATION");
    const filtersIndex = text.indexOf("TRADE AREA (LEGACY)");
    const pageIndex = text.indexOf("SHOWING");
    const tableIndex = Math.max(text.indexOf("CODE / SKU"), text.indexOf("NO PRICEBOOK ITEMS MATCH THE CURRENT FILTERS."));
    return navIndex > -1
      && filtersIndex > navIndex
      && pageIndex > filtersIndex
      && (tableIndex === -1 || tableIndex > pageIndex);
  });
  checks.push([`${label} · Surface order is navigation → filters → results → table`, filterOrder]);

  return checks;
}

async function main() {
  const env = loadEnvFile(ENV_PATH);
  const email = (process.env.PHOENIX_OWNER_EMAIL || env.PHOENIX_OWNER_EMAIL || "phoenixfireplace0@gmail.com").trim().toLowerCase();
  const password = process.env.PHOENIX_OWNER_PASSWORD?.trim() || env.PHOENIX_OWNER_PASSWORD?.trim();

  if (!password) {
    throw new Error("PHOENIX_OWNER_PASSWORD is required in backend/.env for UI navigation verification.");
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const allChecks = [];

  try {
    for (const viewport of [
      { label: "Desktop", width: 1440, height: 960 },
      { label: "Mobile", width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      await login(page, email, password);
      allChecks.push(...await runChecks(page, viewport.label));
      await context.close();
    }

    console.log(JSON.stringify({ checks: Object.fromEntries(allChecks), overall: allChecks.every(([, pass]) => pass) ? "PASS" : "FAIL" }, null, 2));
    for (const [label, pass] of allChecks) {
      console.log(`${pass ? "PASS" : "FAIL"} · ${label}`);
    }

    if (!allChecks.every(([, pass]) => pass)) {
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
