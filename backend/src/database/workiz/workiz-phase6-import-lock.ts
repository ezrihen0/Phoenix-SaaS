import type { DataSource } from "typeorm";

/** MySQL user-level advisory lock — released when the holding session ends (crash-safe). */
export const WORKIZ_PHASE6_IMPORT_LOCK_NAME = "phoenix_workiz_phase6_production_import";

export class WorkizImportAlreadyRunningError extends Error {
  constructor() {
    super("WORKIZ_IMPORT_ALREADY_RUNNING");
    this.name = "WorkizImportAlreadyRunningError";
  }
}

/**
 * Acquire a single-run lock before any Phase 6 production import write.
 * Timeout 0 → fail immediately if another runner holds the lock.
 *
 * Stale/crash behavior: lock is tied to the DB connection. Process kill or disconnect
 * releases it automatically; a stale holder cannot block forever after crash.
 */
export async function withWorkizPhase6ImportLock<T>(
  dataSource: DataSource,
  fn: () => Promise<T>,
): Promise<T> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  let acquired = false;
  try {
    const rows = await queryRunner.query(
      "SELECT GET_LOCK(?, 0) AS acquired",
      [WORKIZ_PHASE6_IMPORT_LOCK_NAME],
    ) as Array<{ acquired: number | null }>;
    acquired = Number(rows[0]?.acquired) === 1;
    if (!acquired) {
      throw new WorkizImportAlreadyRunningError();
    }
    return await fn();
  } finally {
    if (acquired) {
      await queryRunner.query("SELECT RELEASE_LOCK(?)", [WORKIZ_PHASE6_IMPORT_LOCK_NAME]);
    }
    await queryRunner.release();
  }
}
