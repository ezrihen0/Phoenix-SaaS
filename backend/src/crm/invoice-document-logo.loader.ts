import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type InvoiceDocumentLogoAsset = {
  jpegBuffer: Buffer;
  width: number;
  height: number;
};

const MAX_LOGO_BYTES = 512 * 1024;

export function resolveInvoiceDocumentLogoUrl(logoUrl: string | null | undefined) {
  const normalized = logoUrl?.trim();
  return normalized?.length ? normalized : null;
}

export function loadInvoiceDocumentLogoSync(logoUrl: string | null | undefined): InvoiceDocumentLogoAsset | null {
  const resolved = resolveInvoiceDocumentLogoUrl(logoUrl);
  if (!resolved) {
    return null;
  }

  try {
    const localPath = resolveLocalLogoPath(resolved);
    if (!localPath || !existsSync(localPath)) {
      return null;
    }

    const buffer = readFileSync(localPath);
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_LOGO_BYTES) {
      return null;
    }

    if (!isJpeg(buffer) && !isPng(buffer)) {
      return null;
    }

    if (isJpeg(buffer)) {
      const dimensions = readJpegDimensions(buffer);
      if (!dimensions) {
        return null;
      }
      return { jpegBuffer: buffer, width: dimensions.width, height: dimensions.height };
    }

    return null;
  } catch {
    return null;
  }
}

function resolveLocalLogoPath(logoUrl: string) {
  if (logoUrl.startsWith("/uploads/")) {
    return join(process.cwd(), logoUrl.replace(/^\//, ""));
  }

  if (logoUrl.startsWith("uploads/")) {
    return join(process.cwd(), logoUrl);
  }

  if (/^https?:\/\//i.test(logoUrl)) {
    return null;
  }

  if (existsSync(logoUrl)) {
    return logoUrl;
  }

  return join(process.cwd(), logoUrl);
}

function isJpeg(buffer: Buffer) {
  return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

function isPng(buffer: Buffer) {
  return buffer.length > 8 && buffer.toString("ascii", 1, 4) === "PNG";
}

function readJpegDimensions(buffer: Buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      return null;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }
    offset += 2 + length;
  }
  return null;
}

export function buildLogoInitialsFallback(
  businessName: string | null | undefined,
  displayInitials: string | null | undefined,
) {
  const initials = displayInitials?.trim();
  if (initials) {
    return initials.slice(0, 3).toUpperCase();
  }

  const words = (businessName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!words.length) {
    return "CO";
  }

  return words.map((word) => word[0]?.toUpperCase() ?? "").join("") || "CO";
}
