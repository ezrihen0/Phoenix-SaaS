import { createHash } from "crypto";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const pdf = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;

export type PdfInventoryFileStatus =
  | "readable"
  | "unreadable"
  | "text_extractable"
  | "requires_ocr";

export type PdfInventoryFile = {
  filename: string;
  path: string;
  bytes: number;
  sha256: string;
  status: PdfInventoryFileStatus;
  textLength: number | null;
  invoiceCode: string | null;
  error: string | null;
};

export type PdfInventoryReport = {
  sourceDirectory: string;
  pdfFiles: number;
  readable: number;
  unreadable: number;
  duplicateFiles: number;
  textExtractable: number;
  requiresOcr: number;
  duplicateFileNames: string[];
  files: PdfInventoryFile[];
};

export function scanPdfInventory(sourceDirectory: string): PdfInventoryReport {
  const entries = readdirSync(sourceDirectory)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .sort();

  const hashToFilename = new Map<string, string>();
  const duplicateFileNames: string[] = [];
  const files: PdfInventoryFile[] = [];

  for (const filename of entries) {
    const path = join(sourceDirectory, filename);
    let bytes = 0;
    let sha256 = "";
    let status: PdfInventoryFileStatus = "unreadable";
    let textLength: number | null = null;
    let invoiceCode: string | null = null;
    let error: string | null = null;

    try {
      const buffer = readFileSync(path);
      bytes = buffer.length;
      sha256 = createHash("sha256").update(buffer).digest("hex");

      if (hashToFilename.has(sha256)) {
        duplicateFileNames.push(filename);
      } else {
        hashToFilename.set(sha256, filename);
      }

      status = "readable";
    } catch (readError) {
      error = readError instanceof Error ? readError.message : String(readError);
      files.push({ filename, path, bytes, sha256, status, textLength, invoiceCode, error });
      continue;
    }

    files.push({ filename, path, bytes, sha256, status, textLength, invoiceCode, error });
  }

  return {
    sourceDirectory,
    pdfFiles: entries.length,
    readable: files.filter((file) => file.status !== "unreadable").length,
    unreadable: files.filter((file) => file.status === "unreadable").length,
    duplicateFiles: duplicateFileNames.length,
    textExtractable: 0,
    requiresOcr: 0,
    duplicateFileNames,
    files,
  };
}

export async function enrichPdfInventoryWithText(report: PdfInventoryReport): Promise<PdfInventoryReport> {
  const enrichedFiles: PdfInventoryFile[] = [];

  for (const file of report.files) {
    if (file.status === "unreadable") {
      enrichedFiles.push(file);
      continue;
    }

    try {
      const buffer = readFileSync(file.path);
      const parsed = await pdf(buffer);
      const text = (parsed.text ?? "").trim();
      const textLength = text.length;
      const invoiceCode = text.match(/Invoice #([A-Z0-9]+)/i)?.[1] ?? null;

      let status: PdfInventoryFileStatus = "text_extractable";
      if (textLength < 100 || !invoiceCode) {
        status = "requires_ocr";
      }

      enrichedFiles.push({
        ...file,
        status,
        textLength,
        invoiceCode,
        error: null,
      });
    } catch (extractError) {
      enrichedFiles.push({
        ...file,
        status: "requires_ocr",
        textLength: null,
        invoiceCode: null,
        error: extractError instanceof Error ? extractError.message : String(extractError),
      });
    }
  }

  return {
    ...report,
    textExtractable: enrichedFiles.filter((file) => file.status === "text_extractable").length,
    requiresOcr: enrichedFiles.filter((file) => file.status === "requires_ocr").length,
    files: enrichedFiles,
  };
}
