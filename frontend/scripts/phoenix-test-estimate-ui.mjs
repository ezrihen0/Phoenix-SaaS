/**
 * UI smoke: job → owner estimate composer → manual line → save → stay on composer.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const ENV_PATH = resolve(ROOT, "backend/.env");
const BASE_URL = process.env.WIZFIELD_UI_BASE_URL?.trim() || "http://localhost:3000";
const NAV_WAIT = "domcontentloaded";

const CUSTOMER_NAME = process.env.PHOENIX_TEST_CUSTOMER_NAME?.trim() || "Test Customer";
const LINE_AMOUNT = process.env.PHOENIX_TEST_ESTIMATE_LINE_AMOUNT?.trim() || "150";

function loadEnvFile(path) {
  const values = {};
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
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

async function login(page, email, password) {
  await page.goto(`${BASE_URL}/login?next=/customers`, { waitUntil: NAV_WAIT });
  await page.getByPlaceholder("you@company.com").fill(email);
  await page.getByPlaceholder("Enter your password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => new URL(String(url)).pathname !== "/login", { timeout: 60_000 });
}

async function gotoApp(page, path) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: NAV_WAIT });
  await page.waitForTimeout(500);
}

async function resolveCustomerId(page) {
  await gotoApp(page, `/customers?q=${encodeURIComponent(CUSTOMER_NAME)}`);
  await page.waitForTimeout(900);

  const matchingRow = page.locator("tbody tr, article").filter({ hasText: CUSTOMER_NAME }).first();
  if (await matchingRow.count()) {
    const openLink = matchingRow.getByRole("link", { name: /^Open$/u }).first();
    if (await openLink.count()) {
      await openLink.click();
    } else {
      await matchingRow.getByRole("link").first().click();
    }
    await page.waitForURL(/\/customers\/[0-9a-f-]+$/u, { timeout: 30_000 });
    return new URL(page.url()).pathname.split("/").pop();
  }

  throw new Error(`Customer "${CUSTOMER_NAME}" not found for estimate smoke.`);
}

async function resolveJobId(page, customerId) {
  const jobsResponse = await page.request.get(`${BASE_URL}/api/jobs`, { failOnStatusCode: false });
  const jobsPayload = await jobsResponse.json().catch(() => null);
  const jobs = jobsPayload?.data ?? jobsPayload ?? [];
  const match = [...jobs]
    .filter((job) => job.customer_id === customerId || job.customer?.id === customerId)
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))[0];
  if (!match?.id) {
    throw new Error("No job found for estimate smoke — create a job for the test customer first.");
  }
  return match.id;
}

async function createEstimateDraft(page, jobId) {
  await gotoApp(page, `/estimates/create/${jobId}`);
  await page.getByRole("heading", { name: "Create Quote" }).waitFor({ timeout: 20_000 });

  const descriptionField = page.locator("label").filter({ hasText: /^Description$/u }).locator("textarea, input").first();
  await descriptionField.fill("Estimate smoke line item");

  await page.getByRole("button", { name: "Manual line" }).click();
  const lineArticle = page.locator("article").filter({ has: page.locator('span:has-text("Name")') }).first();
  await lineArticle.locator("label").filter({ hasText: "Name" }).locator("input").fill("Diagnostic");
  await lineArticle.locator("label").filter({ hasText: "Unit Price" }).locator("input").fill(LINE_AMOUNT);

  const saveButton = page.getByRole("button", { name: /Create quote|Save quote/u });
  const saveResponsePromise = page.waitForResponse(
    (response) => response.url().includes(`/api/jobs/${jobId}/quote`) && response.request().method() === "PUT",
    { timeout: 60_000 },
  );

  await saveButton.click();
  const saveResponse = await saveResponsePromise;
  const savePayload = await saveResponse.json().catch(() => null);

  if (!saveResponse.ok()) {
    throw new Error(`Estimate save failed with HTTP ${saveResponse.status()}.`);
  }

  await page.getByText(/Saved\./i).waitFor({ timeout: 15_000 }).catch(() => {});

  const pathname = new URL(page.url()).pathname;
  if (!pathname.includes(`/estimates/create/${jobId}`)) {
    throw new Error(`Expected to remain on owner estimate composer after save, got ${pathname}.`);
  }

  return savePayload?.data?.id ?? null;
}

async function main() {
  const env = loadEnvFile(ENV_PATH);
  const email = (process.env.PHOENIX_OWNER_EMAIL || env.PHOENIX_OWNER_EMAIL || "phoenixfireplace0@gmail.com").trim();
  const password = process.env.PHOENIX_OWNER_PASSWORD?.trim() || env.PHOENIX_OWNER_PASSWORD?.trim();

  if (!password || password === "<set-in-local-env-only>") {
    throw new Error("Set PHOENIX_OWNER_PASSWORD in backend/.env");
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  try {
    await login(page, email, password);
    const customerId = await resolveCustomerId(page);
    const jobId = await resolveJobId(page, customerId);
    const quoteId = await createEstimateDraft(page, jobId);

    console.log(
      JSON.stringify(
        {
          ok: true,
          customerId,
          jobId,
          quoteId,
          composerUrl: `${BASE_URL}/estimates/create/${jobId}`,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
