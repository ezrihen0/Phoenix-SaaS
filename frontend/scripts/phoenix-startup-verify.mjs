import { chromium } from "playwright";

const baseUrl = process.env.PHOENIX_STARTUP_BASE_URL ?? "http://127.0.0.1:3000";

async function waitForServer(page) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 5000 });
      if (response && response.ok()) {
        return;
      }
    } catch {
      await page.waitForTimeout(1000);
    }
  }

  throw new Error(`Frontend not reachable at ${baseUrl}`);
}

function fulfillSignedOutSession(route) {
  return route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "unauthorized", message: "Unauthorized" } }),
  });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.route("**/api/auth/session", fulfillSignedOutSession);

  const page = await context.newPage();
  const results = [];

  await waitForServer(page);

  const manifestResponse = await page.goto(`${baseUrl}/manifest.webmanifest`);
  const manifest = await manifestResponse.json();
  results.push({
    check: "manifest_branding",
    pass: manifest.name === "Phoenix CRM" && manifest.background_color === "#05070C" && manifest.display === "standalone",
  });

  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.phoenixBoot === "ready", undefined, {
    timeout: 15000,
  });
  results.push({ check: "signed_out_boot_ready", pass: true });

  const loginHeading = page.getByRole("heading", { name: /sign in to phoenix crm/i });
  results.push({
    check: "signed_out_login_visible",
    pass: await loginHeading.isVisible(),
  });

  await page.unroute("**/api/auth/session");
  await page.route("**/api/auth/session", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await fulfillSignedOutSession(route);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  const slowBootVisible = await page.locator(".phoenix-startup-screen").first().isVisible();
  results.push({ check: "slow_connection_loading_screen", pass: slowBootVisible });
  await page.waitForFunction(() => document.documentElement.dataset.phoenixBoot === "ready", undefined, {
    timeout: 20000,
  });

  await page.unroute("**/api/auth/session");
  await context.unroute("**/api/auth/session");
  await context.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "Service unavailable" } }),
    }),
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  const errorOverlay = page.locator(".phoenix-startup-screen[role='alert']");
  await errorOverlay.waitFor({ state: "visible", timeout: 5000 });
  const errorVisible = await errorOverlay.isVisible();
  const retryVisible = await errorOverlay.getByRole("button", { name: /retry|reintentar|spróbuj|повторити|נסה/i }).isVisible();
  results.push({ check: "init_failure_error_and_retry", pass: errorVisible && retryVisible });

  await context.unroute("**/api/auth/session");
  await context.route("**/api/auth/session", fulfillSignedOutSession);
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  const startupImages = await page.locator('link[rel="apple-touch-startup-image"]').count();
  results.push({ check: "ios_startup_link_tags", pass: startupImages >= 9 });

  await browser.close();

  const failed = results.filter((entry) => !entry.pass);
  for (const entry of results) {
    process.stdout.write(`${entry.pass ? "PASS" : "FAIL"} ${entry.check}\n`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
