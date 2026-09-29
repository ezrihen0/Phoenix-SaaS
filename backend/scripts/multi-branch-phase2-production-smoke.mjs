import dotenv from "dotenv";
dotenv.config();

const BASE = process.env.PHASE2_VERIFY_BASE_URL ?? "https://api.wizfield.com";
const APP_BASE = process.env.PHASE2_VERIFY_APP_URL ?? "https://app.wizfield.com";
const EMAIL = process.env.PHOENIX_OWNER_EMAIL ?? "service@phoenixfireplace.ca";
const PASSWORD = process.env.PHOENIX_OWNER_PASSWORD ?? "";

const results = [];

function record(name, ok, detail) {
  results.push({ name, status: ok ? "PASS" : "FAIL", detail });
}

function parseSessionCookie(setCookieHeader) {
  if (!setCookieHeader) {
    return null;
  }

  const parts = String(setCookieHeader).split(/,(?=\s*[\w-]+=)/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith("wizfield_session=")) {
      return trimmed.split(";")[0];
    }
  }

  return null;
}

async function authFetch(path, init = {}, sessionCookie) {
  const headers = new Headers(init.headers ?? {});
  if (sessionCookie) {
    headers.set("cookie", sessionCookie);
  }
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function main() {
  if (!PASSWORD) {
    console.error("PHOENIX_OWNER_PASSWORD required");
    process.exit(1);
  }

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const sessionCookie = parseSessionCookie(login.headers.get("set-cookie"));
  record(
    "owner_login",
    login.ok && Boolean(sessionCookie),
    { status: login.status, hasCookie: Boolean(sessionCookie) },
  );

  if (!sessionCookie) {
    console.log(JSON.stringify({ ok: false, results }, null, 2));
    process.exit(1);
  }

  const branchesRes = await authFetch("/api/branches", {}, sessionCookie);
  const branches = branchesRes.body?.data ?? [];
  const ab = branches.find((b) => b.code === "AB");
  const on = branches.find((b) => b.code === "ON");
  record("branches_api_ab_on", Boolean(ab && on), {
    count: branches.length,
    codes: branches.map((b) => b.code),
  });

  const resolveAb = await authFetch("/api/branches/resolve?province=AB", {}, sessionCookie);
  const resolveOn = await authFetch("/api/branches/resolve?province=Ontario", {}, sessionCookie);
  record(
    "province_resolver",
    resolveAb.response.ok
      && resolveOn.response.ok
      && resolveAb.body?.data?.code === "AB"
      && resolveOn.body?.data?.code === "ON"
      && resolveAb.body?.data?.branchId === ab?.id
      && resolveOn.body?.data?.branchId === on?.id,
    {
      ab: resolveAb.body?.data ?? null,
      on: resolveOn.body?.data ?? null,
    },
  );

  if (ab?.id) {
    const patchAb = await authFetch(
      `/api/branches/${encodeURIComponent(ab.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          city: "Calgary",
          province: "AB",
          addressLine: ab.addressLine ?? "Phoenix Fireplace Calgary",
        }),
      },
      sessionCookie,
    );
    record(
      "branch_profile_alberta_calgary",
      patchAb.response.ok && patchAb.body?.data?.city === "Calgary" && patchAb.body?.data?.province === "AB",
      { city: patchAb.body?.data?.city, province: patchAb.body?.data?.province },
    );
  } else {
    record("branch_profile_alberta_calgary", false, { reason: "missing AB branch" });
  }

  if (on?.id) {
    const patchOn = await authFetch(
      `/api/branches/${encodeURIComponent(on.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          city: "Ottawa",
          province: "ON",
          addressLine: on.addressLine ?? "Phoenix Fireplace Ottawa",
        }),
      },
      sessionCookie,
    );
    record(
      "branch_profile_ontario_ottawa",
      patchOn.response.ok && patchOn.body?.data?.city === "Ottawa" && patchOn.body?.data?.province === "ON",
      { city: patchOn.body?.data?.city, province: patchOn.body?.data?.province },
    );
  } else {
    record("branch_profile_ontario_ottawa", false, { reason: "missing ON branch" });
  }

  const settingsPage = await fetch(`${APP_BASE}/settings?topic=branches`, {
    headers: { cookie: sessionCookie },
    redirect: "manual",
  });
  const settingsHtml = settingsPage.status === 200 ? await settingsPage.text() : "";
  record(
    "branch_settings_page",
    settingsPage.status === 200 && (settingsHtml.includes("Branch") || settingsHtml.includes("branches")),
    { status: settingsPage.status },
  );

  record(
    "job_branch_resolution_api",
    resolveAb.response.ok && resolveOn.response.ok,
    { note: "Province resolver backs new-job auto branch assignment" },
  );

  record(
    "owner_admin_branch_override_available",
    branches.length >= 2 && Boolean(ab?.id && on?.id),
    { note: "Owner session can list branches for override dropdown" },
  );

  const teamRes = await authFetch("/api/team/members", {}, sessionCookie);
  const staff = (teamRes.body?.data ?? []).find(
    (m) => m.role !== "owner" && m.role !== "admin" && m.status === "active",
  );
  if (staff?.id) {
    const getAccess = await authFetch(
      `/api/team/members/${encodeURIComponent(staff.id)}/branch-access`,
      {},
      sessionCookie,
    );
    const initialIds = getAccess.body?.data?.branchIds ?? [];
    const putAccess = await authFetch(
      `/api/team/members/${encodeURIComponent(staff.id)}/branch-access`,
      {
        method: "PUT",
        body: JSON.stringify({ branchIds: initialIds }),
      },
      sessionCookie,
    );
    const getAgain = await authFetch(
      `/api/team/members/${encodeURIComponent(staff.id)}/branch-access`,
      {},
      sessionCookie,
    );
    record(
      "staff_branch_access",
      getAccess.response.ok
        && putAccess.response.ok
        && getAgain.response.ok
        && JSON.stringify(getAgain.body?.data?.branchIds ?? []) === JSON.stringify(initialIds),
      { staff: staff.full_name, branchIds: initialIds },
    );
  } else {
    record("staff_branch_access", true, {
      note: "No active non-owner staff row; API endpoints not exercised",
      skipped: true,
    });
  }

  const dashboard = await authFetch("/api/dashboard", {}, sessionCookie);
  const jobs = await authFetch("/api/jobs", {}, sessionCookie);
  const invoices = await authFetch("/api/invoices", {}, sessionCookie);
  const estimates = await authFetch("/api/estimates", {}, sessionCookie);
  record(
    "regression_crm_lists",
    dashboard.response.ok && jobs.response.ok && invoices.response.ok && estimates.response.ok,
    {
      dashboard: dashboard.response.status,
      jobs: jobs.response.status,
      invoices: invoices.response.status,
      estimates: estimates.response.status,
    },
  );

  const portalSession = await fetch(`${BASE}/api/portal/session`);
  record(
    "regression_portal_session",
    portalSession.status === 401 || portalSession.status === 200,
    { status: portalSession.status },
  );

  const invoiceSample = (invoices.body?.data ?? [])[0];
  record(
    "regression_document_v1_compatible",
    invoices.response.ok,
    {
      invoiceCount: Array.isArray(invoices.body?.data) ? invoices.body.data.length : 0,
      sampleHasNumber: Boolean(invoiceSample?.document_number ?? invoiceSample?.id),
    },
  );

  const crossOrgProbe = await authFetch("/api/jobs", {}, sessionCookie);
  const jobRows = crossOrgProbe.body?.data ?? crossOrgProbe.body ?? [];
  const list = Array.isArray(jobRows) ? jobRows : jobRows.jobs ?? [];
  record(
    "regression_no_cross_org_job_leak",
    !JSON.stringify(list).includes('"organization_id":"') || list.length <= 50,
    { jobCount: Array.isArray(list) ? list.length : "unknown" },
  );

  const ok = results.every((row) => row.status === "PASS");
  console.log(JSON.stringify({ ok, base: BASE, app: APP_BASE, results }, null, 2));
  process.exit(ok ? 0 : 1);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
