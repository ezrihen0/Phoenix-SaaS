/**
 * Playwright E2E: logout UI + authFetch 401 -> clearClientAuth (candidate build only).
 * Env: PHOENIX_OWNER_PASSWORD, APP_BASE_URL (default http://127.0.0.1:3000)
 */
import { chromium } from "playwright";

const APP = (process.env.APP_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const HOST = new URL(APP).hostname;
const EMAIL = process.env.PHOENIX_OWNER_EMAIL?.trim();
const PASSWORD = process.env.PHOENIX_OWNER_PASSWORD?.trim();

async function loginCookie() {
  const res = await fetch(`${APP}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const pair = setCookie
    .split(/,(?=\s*[\w-]+=)/)
    .map((p) => p.trim())
    .find((p) => p.startsWith("wizfield_session="));
  if (!res.ok || !pair) return null;
  return pair.split(";")[0];
}

async function main() {
  if (!PASSWORD || !EMAIL) {
    console.log(JSON.stringify({ ok: false, reason: "missing_credentials" }));
    process.exit(2);
  }

  const cookieHeader = await loginCookie();
  if (!cookieHeader) {
    console.log(JSON.stringify({ ok: false, reason: "login_failed" }));
    process.exit(3);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: "block" });
  const token = cookieHeader.split("=").slice(1).join("=");
  await context.addCookies([
    {
      name: "wizfield_session",
      value: token,
      domain: HOST,
      path: "/",
      httpOnly: true,
      secure: APP.startsWith("https"),
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });
  const results = [];

  await page.goto(`${APP}/home`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => document.documentElement.dataset.phoenixBoot === "ready", {
    timeout: 60000,
  });

  const labelBefore = await page.locator("aside").getByText(/.+/).first().textContent().catch(() => null);
  const hasRealUserLabel =
    labelBefore && !labelBefore.includes("Phoenix CRM User") && labelBefore.trim().length > 0;

  const logoutResponses = [];
  page.on("response", (res) => {
    if (res.url().includes("/api/auth/logout") && res.request().method() === "POST") {
      logoutResponses.push(res);
    }
  });
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.waitForTimeout(2000);
  const logoutStatuses = await Promise.all(
    logoutResponses.map(async (res) => ({
      status: res.status(),
      body: (await res.text()).slice(0, 200),
    })),
  );
  const logoutHttp = logoutStatuses.at(-1)?.status ?? null;
  const logoutEvidence = logoutStatuses.at(-1) ?? { status: null, body: null };
  const cookiesBeforeLogout = await context.cookies();
  await page.waitForURL(`**${APP}/login**`, { timeout: 60000 });
  const logoutUrl = page.url();
  const sessionAfterLogout = await page.evaluate(async () => {
    const res = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
    return res.status;
  });

  results.push({
    check: "logout_ui_redirects_and_clears_session",
    pass: logoutUrl.includes("/login") && logoutHttp === 201 && sessionAfterLogout === 401,
    evidence: {
      finalUrl: logoutUrl,
      logoutPostStatuses: logoutStatuses,
      wizfieldSessionCookieCount: cookiesBeforeLogout.filter((c) => c.name === "wizfield_session").length,
      logoutPostStatus: logoutHttp,
      logoutResponseBody: logoutEvidence.body,
      sessionStatusInBrowserAfterLogout: sessionAfterLogout,
      clientPath: "AppShell logout -> clearClientAuth() then handleLogout() POST /api/auth/logout",
    },
  });

  const cookieB = await loginCookie();
  await context.clearCookies();
  await context.addCookies([
    {
      name: "wizfield_session",
      value: cookieB.split("=").slice(1).join("="),
      domain: HOST,
      path: "/",
      httpOnly: true,
      secure: APP.startsWith("https"),
      sameSite: "Lax",
    },
  ]);

  await page.goto(`${APP}/home`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => document.documentElement.dataset.phoenixBoot === "ready", {
    timeout: 60000,
  });

  const userLabelBefore = await page
    .locator("header p.max-w-\\[180px\\]")
    .first()
    .textContent()
    .catch(() => null);

  await fetch(`${APP}/api/auth/logout`, { method: "POST", headers: { cookie: cookieB } });

  await page.goto(`${APP}/reset-password`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(2000);

  await page.goto(`${APP}/home`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => document.documentElement.dataset.phoenixBoot === "ready", {
    timeout: 60000,
  });

  const sessionInBrowser = await page.evaluate(async () => {
    const res = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
    return res.status;
  });

  const urlAfter = page.url();
  const userLabelAfter = await page
    .locator("header p.max-w-\\[180px\\]")
    .first()
    .textContent()
    .catch(() => null);

  const signedOutUi =
    userLabelAfter?.trim() === "Phoenix CRM User" || urlAfter.includes("/login");

  results.push({
    check: "authfetch_401_clears_boot_session_state",
    pass: sessionInBrowser === 401 && signedOutUi && userLabelBefore?.trim() !== "Phoenix CRM User",
    evidence: {
      userLabelBeforeRevoke: userLabelBefore?.trim() ?? null,
      userLabelAfter401Clear: userLabelAfter?.trim() ?? null,
      urlAfterHomeNavigation: urlAfter,
      sessionStatusInBrowser: sessionInBrowser,
      wiring:
        "authFetch 401/403 -> registerClientAuthUnauthorizedHandler -> clearClientAuth (invalidateClientAuthCache + set session null); reset-password mount calls getClientSession -> authFetch",
    },
  });

  await browser.close();

  const failed = results.filter((r) => r.pass === false);
  console.log(
    JSON.stringify(
      {
        ok: failed.length === 0,
        appBase: APP,
        results,
      },
      null,
      2,
    ),
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.log(JSON.stringify({ ok: false, error: error.message }));
  process.exit(1);
});
