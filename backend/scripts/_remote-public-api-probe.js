const secret = process.env.PHOENIX_INTEGRATION_SECRET;

async function get(url) {
  const started = Date.now();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
  const body = await res.text();
  return { status: res.status, ms: Date.now() - started, bodySnippet: body.slice(0, 200) };
}

(async () => {
  const base = "https://api.wizfield.com";
  const paths = [
    "/api/integrations/phoenix/request-service/availability?location=calgary&from=2026-11-01&to=2026-11-30",
    "/api/health",
  ];
  const results = [];
  for (const path of paths) {
    results.push({ path, ...(await get(base + path)) });
  }
  process.stdout.write(JSON.stringify({ orgConfigured: Boolean(process.env.PHOENIX_INTEGRATION_ORGANIZATION_ID), results }));
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
