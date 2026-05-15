import { verify } from "node:crypto";

import { apiError } from "./api-response";
import { createTelnyxPublicKey } from "./telnyx-signature";

export type TelnyxEd25519VerifyOptions = {
  rawBody: Buffer;
  signature: string | null;
  timestamp: string | null;
  publicKey: string;
  skipVerification: boolean;
};

/**
 * Validates `timestamp|rawBody` Ed25519 signatures used by Telnyx webhooks and AI Assistant HTTP tools.
 */
export function assertTelnyxEd25519SignatureValid(options: TelnyxEd25519VerifyOptions): void {
  if (options.skipVerification) {
    return;
  }

  if (!options.publicKey.trim()) {
    apiError(500, "telnyx_public_key_missing", "TELNYX_PUBLIC_KEY is required to verify Telnyx signatures.");
  }

  if (!options.signature || !options.timestamp) {
    apiError(400, "telnyx_signature_missing", "Telnyx signature and timestamp headers are required.");
  }

  const message = Buffer.from(`${options.timestamp}|${options.rawBody.toString("utf8")}`, "utf8");

  let signatureBuffer: Buffer | null = null;

  try {
    signatureBuffer = Buffer.from(options.signature, "base64");
    if (!signatureBuffer.length) {
      signatureBuffer = null;
    }
  } catch {
    signatureBuffer = null;
  }

  if (!signatureBuffer) {
    try {
      signatureBuffer = Buffer.from(options.signature, "hex");
    } catch {
      apiError(400, "telnyx_signature_invalid", "Telnyx signature header is malformed.");
    }
  }

  let keyObject;
  try {
    keyObject = createTelnyxPublicKey(options.publicKey);
  } catch {
    apiError(500, "telnyx_public_key_invalid", "TELNYX_PUBLIC_KEY could not be parsed.");
  }

  try {
    const verified = verify(null, message, keyObject, signatureBuffer);

    if (!verified) {
      apiError(401, "telnyx_signature_verification_failed", "Telnyx signature verification failed.");
    }
  } catch {
    apiError(401, "telnyx_signature_verification_failed", "Telnyx signature verification failed.");
  }
}
