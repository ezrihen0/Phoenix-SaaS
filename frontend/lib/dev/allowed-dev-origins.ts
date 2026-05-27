import os from "node:os";

/** Private IPv4 ranges commonly used for phone-on-WiFi dev testing. */
const PRIVATE_IPV4_PREFIXES = ["192.168.", "10."];

function isPrivateLanAddress(address: string) {
  if (address.startsWith("127.")) {
    return false;
  }

  return PRIVATE_IPV4_PREFIXES.some((prefix) => address.startsWith(prefix));
}

function detectLanHostnames(): string[] {
  return Object.values(os.networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address)
    .filter(isPrivateLanAddress);
}

/** Wildcards for common LAN ranges — survives DHCP IP changes on the dev machine. */
const DEFAULT_LAN_WILDCARDS = ["192.168.*.*", "10.*.*.*"];

export function readAllowedDevOrigins(): string[] {
  const configured = (process.env.DEV_ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return [...new Set([...configured, ...detectLanHostnames(), ...DEFAULT_LAN_WILDCARDS])];
}

export function readMobileDevUrls(port = Number(process.env.PORT ?? "3000")): string[] {
  return readAllowedDevOrigins().map((hostname) => `http://${hostname}:${port}`);
}
