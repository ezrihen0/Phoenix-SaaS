import type { Response } from "express";

import type { PdfDownloadResponseOptions } from "./pdf-render.types";

export function isPdfDownloadRequested(download: PdfDownloadResponseOptions["download"]) {
  return download === true || download === "1" || download === "true";
}

export function setPdfDownloadResponseHeaders(
  response: Response,
  options: PdfDownloadResponseOptions,
) {
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader(
    "Content-Disposition",
    `${isPdfDownloadRequested(options.download) ? "attachment" : "inline"}; filename="${options.filename}"`,
  );
}
