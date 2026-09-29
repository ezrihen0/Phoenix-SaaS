const http = require("http");

const secret = process.env.PHOENIX_INTEGRATION_SECRET || process.env.WIZFIELD_INTEGRATION_SECRET;
if (!secret) {
  console.error("missing integration secret");
  process.exit(1);
}

function get(path) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: Number(process.env.PORT || process.env.BACKEND_PORT || 8080),
        path,
        method: "GET",
        headers: { Authorization: `Bearer ${secret}` },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode, ms: Date.now() - started, body });
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(10_000, () => {
      req.destroy(new Error("timeout"));
    });
    req.end();
  });
}

(async () => {
  const port = process.env.PORT || process.env.BACKEND_PORT || 8080;
  const checks = [];
  for (const location of ["calgary", "ottawa"]) {
    const path = `/api/integrations/phoenix/request-service/availability?location=${location}&from=2026-11-01&to=2026-11-30`;
    const result = await get(path);
    let parsed = null;
    try {
      parsed = JSON.parse(result.body);
    } catch {}
    checks.push({
      location,
      httpStatus: result.status,
      latencyMs: result.ms,
      ok: result.status === 200 && parsed && Array.isArray(parsed.days) && parsed.days.length === 30,
      dayCount: parsed?.days?.length ?? 0,
      sampleDay: parsed?.days?.[0]?.date ?? null,
    });
  }

  process.stdout.write(JSON.stringify({ portProbe: port, checks }, null, 0));
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
