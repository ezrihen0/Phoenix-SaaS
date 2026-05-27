import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const port = process.env.PORT ?? "3000";
const frontendRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = require.resolve("next/dist/bin/next");

function detectLanHostnames() {
  return Object.values(os.networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address)
    .filter((address) => address.startsWith("192.168.") || address.startsWith("10."));
}

const lanHostnames = detectLanHostnames();

console.log("WizField frontend dev (network enabled)");
console.log(`  Local:   http://localhost:${port}`);

for (const hostname of lanHostnames) {
  console.log(`  Mobile:  http://${hostname}:${port}`);
}

if (lanHostnames.length === 0) {
  console.log("  Mobile:  (no 192.168.x / 10.x address detected — check Wi-Fi)");
}

const child = spawn(
  process.execPath,
  [nextBin, "dev", "--hostname", "0.0.0.0", "--port", port],
  {
    stdio: "inherit",
    cwd: frontendRoot,
    env: process.env,
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
