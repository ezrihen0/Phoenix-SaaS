import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const PRICEBOOK_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export type PricebookImageInput = {
  buffer: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
};

const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/;

function detectImageFormat(buffer: Buffer): PricebookImageInput["extension"] | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }

  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
  ) {
    return "png";
  }

  if (
    buffer.length >= 12
    && buffer.toString("ascii", 0, 4) === "RIFF"
    && buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }

  return null;
}

function contentTypeForExtension(extension: PricebookImageInput["extension"]): PricebookImageInput["contentType"] {
  if (extension === "jpg") {
    return "image/jpeg";
  }

  if (extension === "png") {
    return "image/png";
  }

  return "image/webp";
}

export function parseOptionalPricebookImage(value: unknown): PricebookImageInput | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("imageDataUrl must be a JPEG, PNG, or WebP data URL.");
  }

  const match = value.trim().match(DATA_URL_PATTERN);

  if (!match) {
    throw new Error("imageDataUrl must be a JPEG, PNG, or WebP data URL.");
  }

  const declaredType = match[1] as PricebookImageInput["contentType"];
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");

  if (buffer.length === 0) {
    throw new Error("Image file is empty.");
  }

  if (buffer.length > PRICEBOOK_IMAGE_MAX_BYTES) {
    throw new Error("Image must be 2 MB or smaller.");
  }

  const detected = detectImageFormat(buffer);

  if (!detected) {
    throw new Error("Image type is not supported.");
  }

  if (contentTypeForExtension(detected) !== declaredType) {
    throw new Error("Image data does not match the declared image type.");
  }

  return {
    buffer,
    contentType: declaredType,
    extension: detected,
  };
}

export function pricebookImageUploadsRoot() {
  return join(process.cwd(), "uploads", "pricebook-images");
}

export async function writePricebookImageFile(
  organizationId: string,
  itemId: string,
  image: PricebookImageInput,
) {
  const storageKey = `${organizationId}/${itemId}.${image.extension}`;
  const absolutePath = join(pricebookImageUploadsRoot(), storageKey);
  await mkdir(join(pricebookImageUploadsRoot(), organizationId), { recursive: true });
  await writeFile(absolutePath, image.buffer);
  return storageKey;
}

export async function removePricebookImageFile(storageKey: string | null | undefined) {
  if (!storageKey || storageKey.includes("..") || storageKey.startsWith("/") || storageKey.includes("\\")) {
    return;
  }

  try {
    await unlink(join(pricebookImageUploadsRoot(), storageKey));
  } catch {
    // Best-effort cleanup; the catalog row remains the source of truth.
  }
}
