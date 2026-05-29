import { config } from "dotenv";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Always load `backend/.env` regardless of monorepo root cwd. */
const backendEnvPath = join(__dirname, ".env");

if (existsSync(backendEnvPath)) {
  config({ path: backendEnvPath });
}
