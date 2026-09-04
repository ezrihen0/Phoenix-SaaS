import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export type PdfManifestEntryStatus = "new" | "processed" | "failed" | "changed";

export type PdfManifestEntry = {
  filename: string;
  sha256: string;
  invoiceNumber: string | null;
  status: PdfManifestEntryStatus;
  lastRunAt: string | null;
  lastInvoiceCode: string | null;
  extractionOk: boolean;
  matchClass: string | null;
  error: string | null;
};

export type PdfManifest = {
  updatedAt: string;
  entries: Record<string, PdfManifestEntry>;
};

function manifestPath(baseDir: string): string {
  return join(baseDir, "workiz-invoice-pdf-manifest.json");
}

export function loadPdfManifest(baseDir: string): PdfManifest {
  const path = manifestPath(baseDir);
  if (!existsSync(path)) {
    return { updatedAt: new Date().toISOString(), entries: {} };
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PdfManifest;
  } catch {
    return { updatedAt: new Date().toISOString(), entries: {} };
  }
}

export function shouldProcessPdf(entry: PdfManifestEntry | undefined, sha256: string): {
  process: boolean;
  reason: string;
} {
  if (!entry) return { process: true, reason: "new_pdf" };
  if (entry.sha256 !== sha256) return { process: true, reason: "changed_pdf" };
  if (entry.status === "failed") return { process: true, reason: "retry_failed" };
  if (entry.status === "processed" && entry.extractionOk) {
    return { process: false, reason: "already_successfully_processed" };
  }
  return { process: true, reason: "reprocess" };
}

export function upsertPdfManifestEntry(
  manifest: PdfManifest,
  input: {
    filename: string;
    sha256: string;
    invoiceNumber: string | null;
    extractionOk: boolean;
    matchClass: string | null;
    error: string | null;
  },
): PdfManifestEntryStatus {
  const existing = manifest.entries[input.filename];
  let status: PdfManifestEntryStatus = "new";
  if (existing && existing.sha256 !== input.sha256) status = "changed";
  else if (existing?.status === "processed" && input.extractionOk) status = "processed";
  else if (!input.extractionOk || input.error) status = "failed";
  else status = "processed";

  manifest.entries[input.filename] = {
    filename: input.filename,
    sha256: input.sha256,
    invoiceNumber: input.invoiceNumber,
    status,
    lastRunAt: new Date().toISOString(),
    lastInvoiceCode: input.invoiceNumber,
    extractionOk: input.extractionOk,
    matchClass: input.matchClass,
    error: input.error,
  };

  manifest.updatedAt = new Date().toISOString();
  return status;
}

export function savePdfManifest(baseDir: string, manifest: PdfManifest): void {
  mkdirSync(baseDir, { recursive: true });
  writeFileSync(manifestPath(baseDir), JSON.stringify(manifest, null, 2));
}
