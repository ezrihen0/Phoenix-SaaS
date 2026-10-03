import "dotenv/config";
import "reflect-metadata";

import mysql from "mysql2/promise";

import { buildDataSourceOptions } from "./typeorm.config";

/**
 * Staging/dev backfill: set memberships.assignable_to_jobs from legacy rules.
 * Technician system role -> true; all other roles -> false.
 * Does not reactivate technicians or change explicit values already set.
 *
 * Usage:
 *   npm run team:assignment-eligibility:backfill --workspace backend -- --dry-run
 *   npm run team:assignment-eligibility:backfill --workspace backend -- --apply
 */

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = process.argv.includes("--dry-run") || !apply;

  if (!dryRun && !apply) {
    console.error("Pass --dry-run (default) or --apply.");
    process.exit(1);
  }

  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Assignment eligibility backfill supports MySQL only.");
  }

  const connection = await mysql.createConnection({
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 3306,
    user: options.username ?? "root",
    password: options.password ?? "",
    database: options.database,
  });

  try {
    const [preview] = await connection.query(
      `
        SELECT COUNT(*) AS would_update
        FROM memberships
        WHERE assignable_to_jobs IS NULL
          AND status IN ('active', 'invited', 'suspended')
      `,
    );

    const previewRows = preview as Array<{ would_update: number }>;
    const wouldUpdate = Number(previewRows[0]?.would_update ?? 0);
    console.log(JSON.stringify({ mode: dryRun ? "dry-run" : "apply", wouldUpdate }, null, 2));

    if (dryRun || wouldUpdate === 0) {
      return;
    }

    const [result] = await connection.query(
      `
        UPDATE memberships
        SET assignable_to_jobs = CASE WHEN role = 'technician' THEN 1 ELSE 0 END
        WHERE assignable_to_jobs IS NULL
          AND status IN ('active', 'invited', 'suspended')
      `,
    );

    console.log(JSON.stringify({ applied: true, result }, null, 2));
  } finally {
    await connection.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
