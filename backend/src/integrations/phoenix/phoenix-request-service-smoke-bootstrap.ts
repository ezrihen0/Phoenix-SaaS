import type { DataSource } from "typeorm";

import { MultiBranchPhase1Foundation1790000000000 } from "../../database/migrations/deferred/1790000000000-multi-branch-phase1-foundation";

/**
 * Ephemeral smoke databases run active migrations only. verify-schema and Phoenix live timing
 * require multi-branch DDL from the deferred migration. Apply it here for isolated test DBs
 * without promoting the migration into migrations/active.
 */
export async function applyPhoenixRequestServiceSmokeSchema(dataSource: DataSource) {
  await dataSource.runMigrations();

  const rows = (await dataSource.query(
    `
      SELECT COUNT(*) AS c
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'branches'
    `,
  )) as Array<{ c: number | string }>;

  if (Number(rows[0]?.c ?? 0) > 0) {
    return;
  }

  const runner = dataSource.createQueryRunner();
  await runner.connect();
  try {
    await new MultiBranchPhase1Foundation1790000000000().up(runner);
  } finally {
    await runner.release();
  }
}
