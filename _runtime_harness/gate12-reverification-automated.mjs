/**
 * Automated subset of Gate 12 reverification (3-org topology via multi-org admin + peer user).
 * Does not replace full manual browser matrix on deployed domain.
 */
const BACKEND = process.env.WIZFIELD_BACKEND_URL ?? "http://127.0.0.1:4000";
const ADMIN_EMAIL = process.env.WIZFIELD_ADMIN_EMAIL ?? "admin@phoenixcrm.local";
const ADMIN_PASSWORD = process.env.WIZFIELD_ADMIN_PASSWORD?.trim();
if (!ADMIN_PASSWORD) {
  throw new Error("WIZFIELD_ADMIN_PASSWORD must be set to run gate12-reverification-automated.mjs.");
}

const results = [];

function record(id, step, pass, notes) {
  results.push({ id, step, pass, notes });
}

class CookieClient {
  cookies = new Map();
  absorb(response) {
    for (const line of response.headers.getSetCookie?.() ?? []) {
      const part = line.split(";")[0];
      const eq = part.indexOf("=");
      if (eq > 0) this.cookies.set(part.slice(0, eq), part.slice(eq + 1));
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async request(path, init = {}) {
    const headers = new Headers(init.headers ?? {});
    const cookie = this.header();
    if (cookie) headers.set("cookie", cookie);
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const response = await fetch(`${BACKEND}${path}`, { ...init, headers });
    this.absorb(response);
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 300) }; }
    return { status: response.status, json };
  }
}

function ok(status) {
  return status >= 200 && status < 300;
}

function blockedForeign(res) {
  if (res.status === 404) return true;
  const inner = res.json?.error?.details?.response?.error?.code;
  return inner === "customer_not_found" || inner === "job_not_found" || inner === "lead_not_found"
    || inner === "invoice_not_found" || inner === "estimate_not_found";
}

async function main() {
  const admin = new CookieClient();
  const login = await admin.request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  record("G12-01", "Multi-org admin login", ok(login.status), `HTTP ${login.status}`);

  const memberships = login.json?.data?.memberships ?? [];
  const orgA = memberships[0]?.organization?.id;
  const orgB = memberships[1]?.organization?.id;
  record("G12-02", "Admin has 2+ org memberships", Boolean(orgA) && Boolean(orgB), `count=${memberships.length}`);

  if (!orgA || !orgB) {
    console.log(JSON.stringify({ ok: false, results }, null, 2));
    process.exit(1);
  }

  await admin.request("/api/auth/active-organization", {
    method: "POST",
    body: JSON.stringify({ organizationId: orgA }),
  });

  const markerA = `G12-A-${Date.now()}`;
  const custA = await admin.request("/api/customers", {
    method: "POST",
    body: JSON.stringify({
      fullName: markerA,
      phone: "4035551001",
      serviceAddressLine1: "100 A St",
      serviceCity: "Calgary",
      servicePostalCode: "T2P1A1",
    }),
  });
  const customerAId = custA.json?.data?.id;
  record("G12-03", "Create Org A customer fixture", ok(custA.status) && Boolean(customerAId), customerAId ?? "fail");

  const searchA = await admin.request(`/api/search?q=${encodeURIComponent(markerA)}`);
  const searchHitsA = searchA.json?.data?.customers ?? searchA.json?.data?.results ?? [];
  const searchFoundA = Array.isArray(searchHitsA)
    && searchHitsA.some((row) => row.title === markerA || row.id === customerAId);
  record("G12-04", "Search finds Org A marker while active on Org A", ok(searchA.status) && searchFoundA, `hits=${Array.isArray(searchHitsA) ? searchHitsA.length : 0}`);

  const dashA = await admin.request("/api/dashboard");
  record("G12-05", "Dashboard loads on Org A", ok(dashA.status), `HTTP ${dashA.status}`);

  await admin.request("/api/auth/active-organization", {
    method: "POST",
    body: JSON.stringify({ organizationId: orgB }),
  });

  const foreignCustomer = await admin.request(`/api/customers/${customerAId}`);
  record("G12-06", "Foreign customer ID blocked on Org B", blockedForeign(foreignCustomer), `HTTP ${foreignCustomer.status}`);

  const searchB = await admin.request(`/api/search?q=${encodeURIComponent(markerA)}`);
  const searchHitsB = searchB.json?.data?.customers ?? searchB.json?.data?.results ?? [];
  const searchFoundB = Array.isArray(searchHitsB)
    && searchHitsB.some((row) => row.title === markerA || row.id === customerAId);
  record("G12-07", "Search does not leak Org A marker on Org B", ok(searchB.status) && !searchFoundB, `found=${searchFoundB}`);

  const dashB = await admin.request("/api/dashboard");
  record("G12-08", "Dashboard loads on Org B", ok(dashB.status), `HTTP ${dashB.status}`);

  const peer = new CookieClient();
  const peerReg = await peer.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: `g12peer.${Date.now()}@wizfield.test`,
      password: "Walkthrough1!",
      fullName: "G12 Peer",
      organizationName: "G12 Peer Org",
    }),
  });
  record("G12-09", "Peer User2 org registers (Org C proxy)", ok(peerReg.status), `HTTP ${peerReg.status}`);

  if (customerAId && ok(peerReg.status)) {
    const peerForeign = await peer.request(`/api/customers/${customerAId}`);
    record("G12-10", "Peer cannot read Org A customer", blockedForeign(peerForeign), `HTTP ${peerForeign.status}`);
  }

  const slug = login.json?.data?.active_organization?.slug
    ?? memberships.find((m) => m.organization?.id === orgA)?.organization?.slug;
  if (slug) {
    const book = await fetch(`${BACKEND}/api/public/orgs/${encodeURIComponent(slug)}/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "G12 Booker",
        phone: "4035551002",
        serviceAddressLine1: "200 Book St",
        serviceCity: "Calgary",
        servicePostalCode: "T2P2B2",
        serviceType: "inspection",
        source: "website",
      }),
    });
    const bookJson = await book.json();
    record("G12-11", "Public booking on Org A slug", ok(book.status) && Boolean(bookJson?.data?.leadId), `HTTP ${book.status}`);
  }

  const passed = results.filter((r) => r.pass).length;
  const summary = { ok: passed === results.length, passed, total: results.length, results };
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.ok ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
