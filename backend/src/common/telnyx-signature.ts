import { createPublicKey, type KeyObject } from "node:crypto";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function decodeCompactBase64(value: string) {
  const compact = value.replace(/\s+/g, "");

  if (!compact) {
    return null;
  }

  const normalized = compact.replace(/-/g, "+").replace(/_/g, "/");

  if (/[^A-Za-z0-9+/=]/.test(normalized)) {
    return null;
  }

  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = `${normalized}${"=".repeat(paddingLength)}`;
  const decoded = Buffer.from(padded, "base64");

  if (!decoded.length) {
    return null;
  }

  const expected = padded.replace(/=+$/g, "");
  const actual = decoded.toString("base64").replace(/=+$/g, "");

  return expected === actual ? decoded : null;
}

export function createTelnyxPublicKey(value: string): KeyObject {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("telnyx_public_key_missing");
  }

  if (trimmed.includes("BEGIN PUBLIC KEY")) {
    return createPublicKey(trimmed);
  }

  const decoded = decodeCompactBase64(trimmed);

  if (!decoded) {
    throw new Error("telnyx_public_key_invalid");
  }

  if (decoded.length === 32) {
    const rawEd25519Key = Buffer.from(decoded);
    const spkiDerBuffer = Buffer.concat([ED25519_SPKI_PREFIX, rawEd25519Key]);

    return createPublicKey({
      key: spkiDerBuffer,
      format: "der",
      type: "spki",
    });
  }

  return createPublicKey({
    key: decoded,
    format: "der",
    type: "spki",
  });
}