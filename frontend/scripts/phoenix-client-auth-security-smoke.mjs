/**
 * Security-state smoke against APP_BASE_URL (local candidate or production).
 * Requires PHOENIX_OWNER_PASSWORD. Does not log secrets.
 */
const APP = (process.env.APP_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const EMAIL = process.env.PHOENIX_OWNER_EMAIL?.trim();
const PASSWORD = process.env.PHOENIX_OWNER_PASSWORD?.trim();

function parseCookie(setCookie) {
  return (
    setCookie
      ?.split(/,(?=\s*[\w-]+=)/)
      .map((p) => p.trim())
      .find((p) => p.startsWith("wizfield_session="))
      ?.split(";")[0] ?? null
  );
}

async function login() {
  const res = await fetch(`${APP}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const cookie = parseCookie(res.headers.get("set-cookie"));
  return { ok: res.ok, status: res.status, cookie };
}

async function sessionGet(cookie) {
  const res = await fetch(`${APP}/api/auth/session`, { headers: { cookie } });
  const body = await res.json().catch(() => null);
  return { status: res.status, orgId: body?.data?.active_organization?.id ?? null };
}

async function main() {
  if (!PASSWORD || !EMAIL) {
    console.log(JSON.stringify({ ok: false, reason: "missing_credentials" }));
    process.exit(2);
  }

  const results = [];

  const loginA = await login();
  results.push({
    check: "login",
    pass: loginA.ok && Boolean(loginA.cookie),
    evidence: { httpStatus: loginA.status, hasCookie: Boolean(loginA.cookie) },
  });
  if (!loginA.cookie) {
    console.log(JSON.stringify({ ok: false, appBase: APP, results }, null, 2));
    process.exit(1);
  }

  const sessionBefore = await sessionGet(loginA.cookie);
  results.push({
    check: "session_active_after_login",
    pass: sessionBefore.status === 200 && Boolean(sessionBefore.orgId),
    evidence: { httpStatus: sessionBefore.status, orgIdPresent: Boolean(sessionBefore.orgId) },
  });

  const logoutRes = await fetch(`${APP}/api/auth/logout`, {
    method: "POST",
    headers: { cookie: loginA.cookie },
  });
  const sessionAfterLogout = await sessionGet(loginA.cookie);
  results.push({
    check: "logout_invalidates_session",
    pass: logoutRes.ok && sessionAfterLogout.status === 401,
    evidence: { logoutStatus: logoutRes.status, sessionStatus: sessionAfterLogout.status },
  });

  const loginB = await login();
  const membershipsRes = await fetch(`${APP}/api/auth/organizations`, {
    headers: { cookie: loginB.cookie },
  });
  const membershipsBody = await membershipsRes.json().catch(() => null);
  const memberships = membershipsBody?.data ?? [];
  const altOrg = memberships.find(
    (m) => m.organization_id && m.organization_id !== sessionBefore.orgId,
  );

  if (altOrg?.organization_id) {
    const switchRes = await fetch(`${APP}/api/auth/active-organization`, {
      method: "POST",
      headers: { cookie: loginB.cookie, "content-type": "application/json" },
      body: JSON.stringify({ organizationId: altOrg.organization_id }),
    });
    const sessionAfterSwitch = await sessionGet(loginB.cookie);
    results.push({
      check: "organization_switch_updates_session",
      pass: switchRes.ok && sessionAfterSwitch.orgId === altOrg.organization_id,
      evidence: {
        switchStatus: switchRes.status,
        expectedOrgId: altOrg.organization_id,
        actualOrgId: sessionAfterSwitch.orgId,
      },
    });
  } else {
    results.push({
      check: "organization_switch_updates_session",
      pass: null,
      skipped: true,
      evidence: { reason: "single_org_membership_for_test_account" },
    });
  }

  const loginC = await login();
  await fetch(`${APP}/api/auth/logout`, { method: "POST", headers: { cookie: loginC.cookie } });
  const revokedSession = await sessionGet(loginC.cookie);
  results.push({
    check: "revoked_session_rejected",
    pass: revokedSession.status === 401,
    evidence: { sessionStatus: revokedSession.status },
  });

  const badLogin = await fetch(`${APP}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: "invalid-password-for-smoke-test" }),
  });
  results.push({
    check: "invalid_credentials_rejected",
    pass: badLogin.status === 401 || badLogin.status === 403,
    evidence: { httpStatus: badLogin.status },
  });

  results.push({
    check: "disabled_user_account",
    pass: null,
    skipped: true,
    evidence: {
      reason: "no_dedicated_disabled_test_user_in_environment",
    },
  });

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
