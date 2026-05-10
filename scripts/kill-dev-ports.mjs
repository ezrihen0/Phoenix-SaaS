import { execSync } from "node:child_process";

const targetPorts = [3000, 3001, 4000];

function listPidsOnWindowsPorts(ports) {
  let output = "";

  try {
    output = execSync("netstat -ano -p tcp", { stdio: ["ignore", "pipe", "pipe"] }).toString();
  } catch {
    return [];
  }

  const pids = new Set();

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed.startsWith("TCP")) {
      continue;
    }

    const parts = trimmed.split(/\s+/);

    if (parts.length < 5) {
      continue;
    }

    const localAddress = parts[1];
    const state = parts[3];
    const pid = parts[4];

    if (state !== "LISTENING") {
      continue;
    }

    const portText = localAddress.includes(":") ? localAddress.split(":").pop() : "";
    const port = Number(portText);

    if (!ports.includes(port)) {
      continue;
    }

    if (!Number.isFinite(Number(pid))) {
      continue;
    }

    pids.add(Number(pid));
  }

  return [...pids];
}

function listPidsOnPosixPorts(ports) {
  const pids = new Set();

  for (const port of ports) {
    try {
      const output = execSync(`lsof -ti tcp:${port}`, {
        stdio: ["ignore", "pipe", "ignore"],
      }).toString();

      for (const token of output.split(/\s+/)) {
        const pid = Number(token.trim());

        if (Number.isFinite(pid)) {
          pids.add(pid);
        }
      }
    } catch {
      // Ignore ports with no listeners.
    }
  }

  return [...pids];
}

function killPid(pid) {
  try {
    process.kill(pid, "SIGKILL");
    return { pid, killed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { pid, killed: false, message };
  }
}

const pids = process.platform === "win32"
  ? listPidsOnWindowsPorts(targetPorts)
  : listPidsOnPosixPorts(targetPorts);

if (pids.length === 0) {
  console.log("No existing listeners found on dev ports.");
  process.exit(0);
}

let failures = 0;

for (const pid of pids) {
  const result = killPid(pid);

  if (result.killed) {
    console.log(`Stopped process ${result.pid} on dev ports.`);
    continue;
  }

  failures += 1;
  console.warn(`Could not stop process ${result.pid}: ${result.message}`);
}

if (failures > 0) {
  console.warn("Continuing startup with remaining active listeners.");
}
