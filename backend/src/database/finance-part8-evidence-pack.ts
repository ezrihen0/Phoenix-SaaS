/**
 * Plan 8 — refresh evidence pack by re-running Plan 9 certification.
 * Usage: npm run finance-part8:evidence-pack
 */
import { execSync } from "node:child_process";
import { join } from "node:path";

const backendRoot = join(__dirname, "..", "..");

execSync("npm run finance-part9:certify", {
  stdio: "inherit",
  cwd: backendRoot,
  env: process.env,
});
