/**
 * UI dogfooding: Test Customer → job → $250 labor invoice → paid → receipt → job done.
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
const LABOR_AMOUNT = process.env.PHOENIX_TEST_LABOR_AMOUNT?.trim() || "250";

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

async function findOrCreateCustomer(page) {
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
    const customerId = new URL(page.url()).pathname.split("/").pop();
    return customerId;
  }

  await gotoApp(page, "/customers/new");
  await page.getByPlaceholder("John Smith").fill(CUSTOMER_NAME);
  await page.getByPlaceholder("(555) 000-0000").fill(`555${String(Date.now()).slice(-7)}`);
  await page.getByPlaceholder("customer@example.com").fill(`test.customer.${Date.now()}@example.com`);
  await page.getByPlaceholder("123 Main St").fill("123 Test Street");
  await page.getByPlaceholder("Austin").fill("Edmonton");
  await page.getByPlaceholder("TX").fill("AB");
  await page.getByPlaceholder("78701").fill("T5J 0K1");
  await page.getByRole("button", { name: "Create Customer" }).click();
  await page.waitForURL(/\/customers\/[0-9a-f-]+$/u, { timeout: 30_000 });
  return new URL(page.url()).pathname.split("/").pop();
}

async function createJob(page, customerId) {
  await page.goto(`${BASE_URL}/jobs/new?customerId=${encodeURIComponent(customerId)}`, { waitUntil: NAV_WAIT });
  await page.evaluate(() => window.localStorage.removeItem("wizfield-jobs-new-draft:v1"));
  await page.reload({ waitUntil: NAV_WAIT });
  await page.locator("label").filter({ hasText: /^Full name$/u }).locator("input").waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForFunction(() => {
    const labels = Array.from(document.querySelectorAll("label"));
    const fullNameLabel = labels.find((label) => label.querySelector("span")?.textContent?.trim() === "Full name");
    const input = fullNameLabel?.querySelector("input");
    return input instanceof HTMLInputElement && input.value.trim().length > 0;
  }, { timeout: 20_000 });
  await page.waitForTimeout(800);

  const serviceSelect = page.locator("label").filter({ hasText: /^Service$/u }).locator("select");
  if (await serviceSelect.count()) {
    const optionCount = await serviceSelect.locator("option").count();
    if (optionCount > 1) {
      await serviceSelect.selectOption({ index: 1 });
    }
  }

  const concern = page.getByPlaceholder("What is the customer calling about?");
  if (await concern.count()) {
    await concern.fill("Test service call for invoice workflow.");
  }

  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/api/jobs"),
    { timeout: 90_000 },
  );
  const navigationPromise = page.waitForURL((url) => new URL(String(url)).pathname === "/jobs", { timeout: 90_000 });

  await page.getByRole("button", { name: "Create Unscheduled Job" }).click();

  const [responseResult, navigationResult] = await Promise.allSettled([responsePromise, navigationPromise]);

  if (responseResult.status === "fulfilled") {
    const createResponse = responseResult.value;
    const payload = await createResponse.json().catch(() => null);

    if (!createResponse.ok()) {
      const pageError = await page.locator(".text-rose-600").first().textContent().catch(() => null);
      throw new Error(pageError?.trim() || `Job create failed with HTTP ${createResponse.status()}.`);
    }

    const jobId = payload?.data?.job?.id ?? payload?.job?.id;
    if (jobId) {
      return jobId;
    }
  }

  if (navigationResult.status !== "fulfilled") {
    const pageError = await page.locator(".text-rose-600").first().textContent().catch(() => null);
    throw new Error(pageError?.trim() || "Job create timed out — check service selection and address fields.");
  }

  const jobsResponse = await page.request.get(`${BASE_URL}/api/jobs`, { failOnStatusCode: false });
  const jobsPayload = await jobsResponse.json().catch(() => null);
  const jobs = jobsPayload?.data ?? jobsPayload ?? [];
  const match = [...jobs]
    .filter((job) => job.customer_id === customerId || job.customer?.id === customerId)
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))[0];

  if (!match?.id) {
    throw new Error("Job list navigation succeeded but the new job id could not be resolved.");
  }

  return match.id;
}

async function createLaborInvoice(page, jobId) {
  await gotoApp(page, `/jobs/${jobId}?tab=invoice`);
  await page.getByRole("heading", { name: "Create Invoice" }).waitFor({ timeout: 20_000 });

  const generateButton = page.getByRole("button", { name: /Generate invoice|Save invoice/u });
  const alreadySaved = await generateButton.textContent().then((text) => /Save invoice/i.test(text ?? ""));

  if (!alreadySaved) {
    await page.getByRole("button", { name: "Manual line" }).click();
    const lineArticle = page.locator("article").filter({ has: page.locator('span:has-text("Name")') }).first();
    await lineArticle.locator("label").filter({ hasText: "Name" }).locator("input").fill("Labor");
    await lineArticle.locator("label").filter({ hasText: "Unit Price" }).locator("input").fill(LABOR_AMOUNT);

    page.once("dialog", (dialog) => dialog.accept());

    const saveResponsePromise = page.waitForResponse(
      (response) => response.url().includes(`/api/jobs/${jobId}/invoice`) && response.request().method() === "PUT",
      { timeout: 60_000 },
    );

    await generateButton.click();
    const saveResponse = await saveResponsePromise;
    const savePayload = await saveResponse.json().catch(() => null);

    if (!saveResponse.ok()) {
      throw new Error(`Invoice save failed with HTTP ${saveResponse.status()}.`);
    }

    return savePayload?.data?.id ?? savePayload?.data?.invoice?.id ?? null;
  }

  const balanceText = await page.getByText("Balance Due").locator("xpath=following::*[1]").first().textContent().catch(() => null);
  return { existing: true, balanceText: balanceText?.trim() ?? null };
}

async function markJobStatus(page, jobId, statusValue) {
  await gotoApp(page, `/jobs/${jobId}`);
  const statusSelect = page.locator("label").filter({ hasText: "Update status" }).locator("select").first();
  await statusSelect.waitFor({ state: "visible", timeout: 20_000 });

  const statusResponsePromise = page.waitForResponse(
    (response) => response.url().includes(`/api/jobs/${jobId}/status`) && response.request().method() === "POST",
    { timeout: 60_000 },
  );

  await statusSelect.selectOption(statusValue);
  await statusResponsePromise;
  await page.waitForTimeout(800);
}

async function recordFullPayment(page, jobId) {
  await gotoApp(page, `/jobs/${jobId}?tab=invoice`);
  await page.getByRole("button", { name: "Record full payment" }).click();

  await page.waitForResponse(
    (response) => response.url().includes("/api/invoices/") && response.url().includes("/payments") && response.request().method() === "POST",
    { timeout: 60_000 },
  );

  await page.getByText(/Full payment recorded|Invoice already shows no balance due/i).waitFor({ timeout: 15_000 }).catch(() => {});
}

async function resolveInvoiceId(page, jobId, invoiceResult) {
  if (invoiceResult && typeof invoiceResult === "string") {
    return invoiceResult;
  }

  if (invoiceResult?.id) {
    return invoiceResult.id;
  }

  const jobResponse = await page.request.get(`${BASE_URL}/api/jobs/${jobId}`, { failOnStatusCode: false });
  const jobPayload = await jobResponse.json().catch(() => null);
  return jobPayload?.data?.invoice?.id ?? jobPayload?.data?.job?.invoice?.id ?? jobPayload?.invoice?.id ?? null;
}

async function openReceipt(page, jobId, invoiceResult) {
  const invoiceId = await resolveInvoiceId(page, jobId, invoiceResult);

  if (!invoiceId) {
    throw new Error("Could not resolve invoice id for receipt download.");
  }

  await gotoApp(page, `/invoices/${invoiceId}`);

  const pdfResponsePromise = page.waitForResponse(
    (response) => response.url().includes(`/api/invoices/${invoiceId}/pdf`) && response.status() === 200,
    { timeout: 60_000 },
  );

  await page.getByRole("button", { name: "Download PDF" }).click();
  await pdfResponsePromise.catch(() => {});

  return {
    invoiceId,
    invoiceUrl: `${BASE_URL}/invoices/${invoiceId}`,
    receiptPdfUrl: `${BASE_URL}/api/invoices/${invoiceId}/pdf?download=1`,
  };
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
    const customerId = await findOrCreateCustomer(page);
    const jobId = await createJob(page, customerId);
    const invoiceResult = await createLaborInvoice(page, jobId);

    await markJobStatus(page, jobId, "completed");
    await recordFullPayment(page, jobId);
    await page.waitForTimeout(1500);

    await gotoApp(page, `/jobs/${jobId}`);
    const currentStatusSelect = page.locator("label").filter({ hasText: "Update status" }).locator("select").first();
    const currentStatus = await currentStatusSelect.inputValue().catch(() => "unknown");

    if (currentStatus !== "paid") {
      await markJobStatus(page, jobId, "paid").catch(() => {});
    }

    const receipt = await openReceipt(page, jobId, invoiceResult);

    const result = {
      ok: true,
      customerName: CUSTOMER_NAME,
      customerUrl: `${BASE_URL}/customers/${customerId}`,
      jobUrl: `${BASE_URL}/jobs/${jobId}`,
      invoiceTabUrl: `${BASE_URL}/jobs/${jobId}?tab=invoice`,
      laborAmount: LABOR_AMOUNT,
      invoiceResult,
      receipt,
      finalJobUrl: `${BASE_URL}/jobs/${jobId}`,
    };

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
