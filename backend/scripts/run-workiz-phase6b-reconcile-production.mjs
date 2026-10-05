import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

execFileSync(
  process.execPath,
  ["-r", "ts-node/register", resolve(process.cwd(), "src/database/workiz-phase6b-customer-reconciliation.ts")],
  { stdio: "inherit", env: process.env, cwd: process.cwd() },
);
