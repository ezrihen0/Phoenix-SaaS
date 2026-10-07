/**
 * Read-only client navigation benchmark.
 * Env: PHOENIX_OWNER_PASSWORD, PHOENIX_OWNER_EMAIL, APP_BASE_URL (default http://127.0.0.1:3000),
 *      BENCH_RUNS (default 3), GIT_COMMIT (label).
 */
import { chromium } from "playwright";
import { performance } from "node:perf_hooks";
import { execSync } from "node:child_process";

const APP = (process.env.APP_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const HOST = new URL(APP).hostname;
const EMAIL = process.env.PHOENIX_OWNER_EMAIL?.trim();
const PASSWORD = process.env.PHOENIX_OWNER_PASSWORD?.trim();
const RUNS = Math.max(1, Number.parseInt(process.env.BENCH_RUNS ?? "3", 10) || 3);
const GIT_COMMIT =
  process.env.GIT_COMMIT?.trim()
  || execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();

const ROUTES = [
  { name: "Home", path: "/home", ready: "main" },
  { name: "Jobs", path: "/jobs", ready: "table tbody tr", jobsApi: true },
  { name: "Customers", path: "/customers", ready: "header h1" },
  { name: "Invoices", path: "/invoices", ready: "header h1" },
];

function median(nums) {
  const sorted = [...nums].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function classifyAuthStack(stack) {
  const text = stack ?? "";
  if (text.includes("phoenix-boot-provider")) return "phoenix_boot_provider";
  if (text.includes("app-shell")) return "app_shell";
  if (text.includes("organization-switcher")) return "organization_switcher";
  if (text.includes("global-search-shell")) return "global_search_shell";
  if (text.includes("login/page")) return "login_page";
  if (text.includes("client-auth")) return "client_auth_module";
  return "other_client";
}

async function loginCookieForApp() {
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
  return pair.split(";")[0].split("=").slice(1).join("=");
}

async function onePass(page, passLabel) {
  const rows = [];
  await page.goto(`${APP}/home`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => document.documentElement.dataset.phoenixBoot === "ready", { timeout: 60000 });

  for (const route of ROUTES) {
    const events = [];
    const authStacks = [];
    const t0 = performance.now();

    const onReq = (req) => {
      req.__s = performance.now();
    };
    const onFinish = (req) => {
      if (req.__s === undefined) return;
      const path = new URL(req.url()).pathname;
      let kind = "other";
      if (path === "/api/auth/session") kind = "auth_session";
      else if (path === "/api/auth/destination") kind = "auth_destination";
      else if (path.startsWith("/api/")) kind = "api";
      else if (req.headers()["rsc"] === "1") kind = "rsc";
      else if (req.resourceType() === "document") kind = "document";

      events.push({
        kind,
        path,
        ms: Math.round(performance.now() - req.__s),
        startMs: Math.round(req.__s - t0),
        endMs: Math.round(performance.now() - t0),
      });
    };

    page.on("request", onReq);
    page.on("requestfinished", onFinish);

    await Promise.all([
      page.waitForURL(`**${route.path}`, { timeout: 120000 }),
      page.getByRole("link", { name: route.name, exact: true }).first().click(),
    ]);
    const urlMs = Math.round(performance.now() - t0);

    if (route.jobsApi) {
      await page.waitForResponse((r) => r.url().includes("/api/jobs") && r.status() === 200, {
        timeout: 120000,
      });
    }
    await page.waitForSelector(route.ready, { state: "visible", timeout: 120000 });
    const usableMs = Math.round(performance.now() - t0);

    page.off("request", onReq);
    page.off("requestfinished", onFinish);

    const stacks = await page.evaluate(() => window.__phoenixAuthFetchStacks ?? []);
    for (const entry of stacks) {
      authStacks.push({
        path: entry.url,
        initiator: classifyAuthStack(entry.stack),
      });
    }
    await page.evaluate(() => {
      window.__phoenixAuthFetchStacks = [];
    });

    const authEvents = events.filter((e) => e.kind === "auth_session" || e.kind === "auth_destination");
    const blockingEnd = authEvents
      .filter((e) => e.startMs < urlMs)
      .reduce((max, e) => Math.max(max, e.endMs), 0);

    rows.push({
      pass: passLabel,
      route: route.name,
      urlMs,
      usableMs,
      sessionCalls: authEvents.filter((e) => e.kind === "auth_session").length,
      destCalls: authEvents.filter((e) => e.kind === "auth_destination").length,
      authOverlappingWallMs: authEvents.reduce((s, e) => s + e.ms, 0),
      authBlockingSpanMs: blockingEnd,
      clientAuthInitiators: authStacks,
      documentLoads: events.filter((e) => e.kind === "document").length,
      rscLoads: events.filter((e) => e.kind === "rsc").length,
    });
  }

  return rows;
}

async function main() {
  if (!PASSWORD || !EMAIL) {
    console.log(JSON.stringify({ ok: false, reason: "missing_credentials" }));
    process.exit(2);
  }

  const token = await loginCookieForApp();
  if (!token) {
    console.log(JSON.stringify({ ok: false, reason: "login_failed", appBase: APP }));
    process.exit(3);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
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

  await context.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.__phoenixAuthFetchStacks = [];
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/auth/session") || url.includes("/api/auth/destination")) {
        window.__phoenixAuthFetchStacks.push({ url, stack: new Error().stack ?? "" });
      }
      return original(input, init);
    };
  });

  const page = await context.newPage();
  const allRows = [];

  for (let run = 1; run <= RUNS; run += 1) {
    allRows.push(...(await onePass(page, `run_${run}`)));
    await page.waitForTimeout(300);
  }

  await browser.close();

  const summary = ROUTES.map((route) => {
    const subset = allRows.filter((r) => r.route === route.name);
    return {
      route: route.name,
      runs: subset.length,
      medianUrlMs: median(subset.map((r) => r.urlMs)),
      medianUsableMs: median(subset.map((r) => r.usableMs)),
      medianSessionCalls: median(subset.map((r) => r.sessionCalls)),
      medianDestCalls: median(subset.map((r) => r.destCalls)),
      medianAuthBlockingSpanMs: median(subset.map((r) => r.authBlockingSpanMs)),
      initiators: [...new Set(subset.flatMap((r) => r.clientAuthInitiators.map((i) => i.initiator)))],
    };
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        appBase: APP,
        gitCommit: GIT_COMMIT,
        runsPerRoute: RUNS,
        navigations: allRows,
        summary,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.log(JSON.stringify({ ok: false, error: error.message }));
  process.exit(1);
});
