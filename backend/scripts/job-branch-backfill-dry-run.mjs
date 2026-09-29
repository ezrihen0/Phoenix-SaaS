/**
 * Dry-run: map null branch_id jobs to branches from service_state_or_region only.
 * Read-only. Does not mutate production.
 */
import mysql from "mysql2/promise";

const PHOENIX_ORG_ID = "8d5bc762-eb13-43e5-85a1-723477adb47c";

function normalizeServiceProvinceToBranchCode(value) {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "AB" || normalized === "ALBERTA") {
    return "AB";
  }
  if (normalized === "ON" || normalized === "ONTARIO") {
    return "ON";
  }
  return null;
}

function resolutionStatus(code, provinceRaw) {
  if (!provinceRaw?.trim()) {
    return { status: "MANUAL_REVIEW", reason: "missing_province" };
  }
  if (!code) {
    return { status: "MANUAL_REVIEW", reason: "unsupported_province" };
  }
  return { status: "RESOLVED", reason: null };
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USERNAME ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "wizfield",
  });

  try {
    const [branches] = await connection.query(
      `SELECT id, code, name FROM branches WHERE organization_id = ? AND active = 1`,
      [PHOENIX_ORG_ID],
    );

    const branchByCode = new Map(branches.map((b) => [b.code, b]));

    const [jobs] = await connection.query(
      `SELECT id, title, service_city, service_state_or_region, status, created_at
       FROM jobs
       WHERE organization_id = ?
         AND branch_id IS NULL
       ORDER BY created_at ASC`,
      [PHOENIX_ORG_ID],
    );

    const rows = jobs.map((job) => {
      const provinceRaw = job.service_state_or_region ?? "";
      const code = normalizeServiceProvinceToBranchCode(provinceRaw);
      const branch = code ? branchByCode.get(code) : null;
      const meta = resolutionStatus(code, provinceRaw);

      let resolvedBranch = "—";
      if (meta.status === "RESOLVED" && branch) {
        resolvedBranch = `${branch.name} (${branch.code})`;
      } else if (meta.status === "MANUAL_REVIEW") {
        resolvedBranch =
          meta.reason === "missing_province"
            ? "MANUAL REVIEW — missing province"
            : `MANUAL REVIEW — unsupported province: ${provinceRaw.trim() || "(empty)"}`;
      } else if (code && !branch) {
        resolvedBranch = `MANUAL REVIEW — no active branch for code ${code}`;
      }

      return {
        jobId: job.id,
        serviceCity: job.service_city ?? "",
        province: provinceRaw.trim() || "(empty)",
        resolvedBranch,
        status: meta.status,
        reason: meta.reason,
        branchId: branch?.id ?? null,
        branchCode: code,
        jobStatus: job.status,
        title: job.title,
      };
    });

    const summary = {
      organizationId: PHOENIX_ORG_ID,
      database: process.env.DB_NAME,
      totalNullBranchJobs: rows.length,
      resolved: rows.filter((r) => r.status === "RESOLVED").length,
      manualReview: rows.filter((r) => r.status === "MANUAL_REVIEW").length,
      branchesAvailable: branches.map((b) => ({ code: b.code, name: b.name, id: b.id })),
    };

    console.log(JSON.stringify({ summary, dryRun: rows }, null, 2));
  } finally {
    await connection.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
