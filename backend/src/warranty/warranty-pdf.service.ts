import { Injectable } from "@nestjs/common";

import { loadInvoiceDocumentLogoSync } from "../crm/invoice-document-logo.loader";
import { PdfRenderService } from "../documents/pdf/pdf-render.service";
import type { WarrantyDocumentViewModel } from "./warranty-document-view-model";

export type WarrantyCertificatePdfSnapshot = {
  certificateNumber: string;
  companyName: string;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  companyAddress: string | null;
  companyLicense: string | null;
  companyTaxNumber: string | null;
  accentColor: string | null;
  customerName: string;
  customerCompany: string | null;
  customerAddressLines: string[];
  invoiceNumber: string | null;
  completionDateLabel: string;
  warrantyStartDateLabel: string;
  warrantyEndDateLabel: string;
  warrantyType: string;
  coverageText: string;
  exclusionsText: string;
  lineItems: Array<{
    name: string;
    quantity: string;
    warrantyMonths: number | null;
  }>;
};

const LEFT = 46;
const RIGHT = 548;
const TOP = 800;
const BOTTOM = 56;

@Injectable()
export class WarrantyPdfService {
  constructor(private readonly pdfRenderService: PdfRenderService) {}

  renderLegacy(snapshot: WarrantyCertificatePdfSnapshot) {
    const content = this.buildLegacyContent(snapshot);
    return this.pdfRenderService.renderContentStream(content, {
      fonts: [
        { name: "F1", baseFont: "Helvetica" },
        { name: "F2", baseFont: "Helvetica-Bold" },
      ],
    });
  }

  renderDocument(model: WarrantyDocumentViewModel) {
    const logo = loadInvoiceDocumentLogoSync(model.companyLogoUrl);
    const pages = this.buildPageStreams(model, { hasLogo: Boolean(logo) });
    return renderPdfDocument(pages, logo);
  }

  buildPageStreams(model: WarrantyDocumentViewModel, options?: { hasLogo?: boolean }) {
    const layout = new WarrantyPdfLayout(
      (value) => this.pdfRenderService.escapeText(value),
      model.certificateNumber,
    );
    layout.drawDocument(model, options?.hasLogo === true);
    return layout.finish();
  }

  private buildLegacyContent(input: WarrantyCertificatePdfSnapshot) {
    const left = 46;
    const right = 548;
    let y = 802;
    const out: string[] = [];

    const text = (font: "F1" | "F2", size: number, x: number, yPos: number, value: string) => {
      out.push("BT");
      out.push(`/${font} ${size} Tf`);
      out.push(`${x} ${yPos} Td`);
      out.push(`(${this.pdfRenderService.escapeText(value)}) Tj`);
      out.push("ET");
    };
    const line = (yPos: number) => {
      out.push("0.6 w");
      out.push(`${left} ${yPos} m`);
      out.push(`${right} ${yPos} l`);
      out.push("S");
    };
    const wrap = (value: string, maxChars: number) => {
      const words = value.trim().split(/\s+/);
      const rows: string[] = [];
      let row = "";
      for (const word of words) {
        const candidate = row ? `${row} ${word}` : word;
        if (candidate.length > maxChars && row) {
          rows.push(row);
          row = word;
        } else {
          row = candidate;
        }
      }
      if (row) {
        rows.push(row);
      }
      return rows.length ? rows : [value];
    };

    text("F2", 16, left, y, input.companyName);
    y -= 14;
    for (const row of [input.companyPhone, input.companyEmail, input.companyWebsite, input.companyAddress]) {
      if (row) {
        text("F1", 9, left, y, row);
        y -= 11;
      }
    }
    if (input.companyLicense) {
      text("F1", 8, left, y, `License: ${input.companyLicense}`);
      y -= 10;
    }
    if (input.companyTaxNumber) {
      text("F1", 8, left, y, `Tax/GST: ${input.companyTaxNumber}`);
      y -= 10;
    }

    text("F2", 21, 330, 802, "WARRANTY CERTIFICATE");
    text("F1", 10, 330, 786, input.certificateNumber);
    text("F1", 9, 330, 772, `Warranty: ${input.warrantyType}`);
    y = Math.min(y - 6, 734);
    line(y);
    y -= 16;

    text("F2", 10, left, y, "Certificate Holder");
    text("F2", 10, 332, y, "Service Details");
    y -= 13;
    text("F1", 9, left, y, input.customerName);
    if (input.customerCompany) {
      y -= 11;
      text("F1", 9, left, y, input.customerCompany);
    }
    let customerY = y - 11;
    for (const row of input.customerAddressLines) {
      text("F1", 9, left, customerY, row);
      customerY -= 11;
    }
    let serviceY = y;
    if (input.invoiceNumber) {
      text("F1", 9, 332, serviceY, `Invoice: ${input.invoiceNumber}`);
      serviceY -= 11;
    }
    text("F1", 9, 332, serviceY, `Completed: ${input.completionDateLabel}`);
    serviceY -= 11;
    text("F1", 9, 332, serviceY, `Warranty Start: ${input.warrantyStartDateLabel}`);
    serviceY -= 11;
    text("F1", 9, 332, serviceY, `Warranty End: ${input.warrantyEndDateLabel}`);

    y = Math.min(customerY, serviceY) - 8;
    line(y);
    y -= 16;

    text("F2", 10, left, y, "Coverage");
    y -= 12;
    for (const row of wrap(input.coverageText, 112)) {
      text("F1", 8, left, y, row);
      y -= 10;
    }
    y -= 4;

    text("F2", 10, left, y, "Exclusions");
    y -= 12;
    for (const row of wrap(input.exclusionsText, 112)) {
      text("F1", 8, left, y, row);
      y -= 10;
    }
    y -= 4;

    text("F2", 10, left, y, "Covered Line Items");
    y -= 12;
    text("F2", 8, left, y, "Item");
    text("F2", 8, 390, y, "Qty");
    text("F2", 8, 430, y, "Term");
    y -= 9;
    line(y);
    y -= 11;

    for (const lineItem of input.lineItems.slice(0, 16)) {
      text("F1", 8, left, y, lineItem.name);
      text("F1", 8, 390, y, lineItem.quantity);
      const warrantyLabel = typeof lineItem.warrantyMonths === "number" && lineItem.warrantyMonths > 0
        ? `${lineItem.warrantyMonths} months`
        : "Per policy";
      text("F1", 8, 430, y, warrantyLabel);
      y -= 10;
    }

    text("F1", 6, left, 30, "Generated by WizField");
    return out.join("\n");
  }
}

class WarrantyPdfLayout {
  private pages: string[][] = [];
  private current: string[] = [];
  private y = TOP;

  constructor(
    private readonly escapeText: (value: string) => string,
    private readonly certificateNumber: string,
  ) {}

  drawDocument(model: WarrantyDocumentViewModel, hasLogo: boolean) {
    this.beginPage(false);
    if (hasLogo) {
      this.y = 744;
    }
    this.text("F2", 16, LEFT, this.y, model.companyName);
    this.y -= 16;
    for (const row of [model.companyAddress, model.companyPhone, model.companyEmail, model.companyWebsite]) {
      if (!row) {
        continue;
      }
      this.ensure(12);
      this.text("F1", 9, LEFT, this.y, row);
      this.y -= 12;
    }
    if (model.companyLicense) {
      this.ensure(12);
      this.text("F1", 8, LEFT, this.y, `License: ${model.companyLicense}`);
      this.y -= 12;
    }
    if (model.companyTaxNumber) {
      this.ensure(12);
      this.text("F1", 8, LEFT, this.y, `Tax/GST: ${model.companyTaxNumber}`);
      this.y -= 12;
    }

    this.y -= 8;
    this.ensure(42);
    this.text("F2", 18, LEFT, this.y, "WARRANTY CERTIFICATE");
    this.y -= 16;
    this.text("F1", 11, LEFT, this.y, model.certificateNumber);
    this.y -= 14;
    const statusLine = model.coverageTermLabel
      ? `${model.coverageStatusLabel} | ${model.coverageTermLabel}`
      : `${model.coverageStatusLabel} | ${model.termsSummaryLabel}`;
    this.writeWrapped("F1", 9, LEFT, 90, statusLine, 12);

    this.section("Customer");
    this.writeWrapped("F2", 11, LEFT, 90, model.customerName, 14);
    if (model.customerCompany) {
      this.writeWrapped("F1", 9, LEFT, 90, model.customerCompany, 12);
    }
    if (model.customerPhone) {
      this.writeWrapped("F1", 9, LEFT, 90, `Phone: ${model.customerPhone}`, 12);
    }
    if (model.customerEmail) {
      this.writeWrapped("F1", 9, LEFT, 90, `Email: ${model.customerEmail}`, 12);
    }

    this.section("Service property");
    this.writeWrapped("F1", 10, LEFT, 90, model.propertyLabel, 13);

    this.section("Invoice / reference");
    this.writeWrapped("F1", 10, LEFT, 90, model.invoiceNumber ? `Invoice ${model.invoiceNumber}` : "Invoice not recorded", 13);
    if (model.jobTitle) {
      this.writeWrapped("F1", 9, LEFT, 90, model.jobTitle, 12);
    }
    if (model.coveredAssetLabel) {
      this.writeWrapped("F1", 9, LEFT, 90, `Covered: ${model.coveredAssetLabel}`, 12);
    }
    this.writeWrapped("F1", 9, LEFT, 90, `Completed: ${model.completionDateLabel}`, 12);

    this.section("Coverage summary");
    this.writeWrapped("F1", 9, LEFT, 90, `${model.effectiveDateCaption}: ${model.effectiveDateLabel}`, 12);
    if (model.expirationDateLabel && model.expirationCaption) {
      this.writeWrapped("F1", 9, LEFT, 90, `${model.expirationCaption}: ${model.expirationDateLabel}`, 12);
    }
    this.writeWrapped("F1", 9, LEFT, 90, model.termsSummaryLabel, 12);

    this.section("Covered items");
    this.ensure(16);
    this.text("F2", 8, LEFT, this.y, "Item");
    this.text("F2", 8, 300, this.y, "Qty");
    this.text("F2", 8, 360, this.y, "Warranty term");
    this.text("F2", 8, 470, this.y, "Expiry");
    this.y -= 8;
    this.rule();
    this.y -= 12;

    if (!model.lineItems.length) {
      this.writeWrapped("F1", 9, LEFT, 90, "No covered line items recorded.", 12);
    }

    for (const line of model.lineItems) {
      this.drawLineItem(line, model.emptyTermLabel);
    }

    this.section("Coverage details");
    this.writeWrapped("F1", 9, LEFT, 92, model.coverageText, 12);

    this.section("Limitations / exclusions");
    this.writeWrapped("F1", 9, LEFT, 92, model.exclusionsText, 12);

    this.section("Organization");
    this.writeWrapped("F1", 10, LEFT, 90, model.companyName, 13);
    const contact = [model.companyPhone, model.companyEmail, model.companyWebsite, model.companyAddress]
      .filter((entry): entry is string => Boolean(entry));
    for (const entry of contact) {
      this.writeWrapped("F1", 9, LEFT, 90, entry, 12);
    }
    if (!contact.length && !model.companyLicense && !model.companyTaxNumber) {
      this.writeWrapped("F1", 9, LEFT, 90, "No additional contact details were recorded.", 12);
    }
  }

  finish() {
    const total = this.pages.length || 1;
    if (!this.pages.length) {
      this.beginPage(false);
    }
    return this.pages.map((page, index) => {
      const footer = [
        "BT",
        "/F1 8 Tf",
        `46 32 Td`,
        `(${this.escapeText("Generated by WizField")}) Tj`,
        "ET",
        "BT",
        "/F1 8 Tf",
        `470 32 Td`,
        `(${this.escapeText(`Page ${index + 1} of ${total}`)}) Tj`,
        "ET",
      ];
      return [...page, ...footer].join("\n");
    });
  }

  private beginPage(continued: boolean) {
    this.current = [];
    this.pages.push(this.current);
    this.y = TOP;
    if (continued) {
      this.text("F2", 10, LEFT, this.y, `${this.certificateNumber} continued`);
      this.y -= 8;
      this.rule();
      this.y -= 16;
    }
  }

  private ensure(height: number) {
    const safeHeight = Math.min(height, TOP - BOTTOM - 1);
    if (this.y - safeHeight < BOTTOM) {
      this.beginPage(true);
    }
  }

  private text(font: "F1" | "F2", size: number, x: number, yPos: number, value: string) {
    this.current.push("BT");
    this.current.push(`/${font} ${size} Tf`);
    this.current.push(`${x} ${yPos} Td`);
    this.current.push(`(${this.escapeText(value)}) Tj`);
    this.current.push("ET");
  }

  private rule() {
    this.current.push("0.6 w");
    this.current.push(`${LEFT} ${this.y} m`);
    this.current.push(`${RIGHT} ${this.y} l`);
    this.current.push("S");
  }

  private section(title: string) {
    this.y -= 8;
    this.ensure(28);
    this.text("F2", 11, LEFT, this.y, title);
    this.y -= 6;
    this.rule();
    this.y -= 14;
  }

  private writeWrapped(font: "F1" | "F2", size: number, x: number, maxChars: number, value: string, step: number) {
    for (const row of wrapPdfText(value, maxChars)) {
      this.ensure(step);
      this.text(font, size, x, this.y, row);
      this.y -= step;
    }
  }

  private drawLineItem(
    line: WarrantyDocumentViewModel["lineItems"][number],
    emptyTermLabel: string,
  ) {
    const nameRows = wrapPdfText(line.description ? `${line.name} - ${line.description}` : line.name, 36);
    const termRows = wrapPdfText(line.termLabel ?? emptyTermLabel, 16);
    const expiryRows = wrapPdfText(line.expiryLabel ?? emptyTermLabel, 16);
    const qtyRows = wrapPdfText(line.quantity, 8);
    const rowCount = Math.max(nameRows.length, termRows.length, expiryRows.length, qtyRows.length, 1);
    for (let index = 0; index < rowCount; index += 1) {
      this.ensure(14);
      if (nameRows[index]) {
        this.text("F1", 8, LEFT, this.y, nameRows[index]!);
      }
      if (index === 0 || qtyRows[index]) {
        if (qtyRows[index]) {
          this.text("F1", 8, 300, this.y, qtyRows[index]!);
        }
      }
      if (termRows[index]) {
        this.text("F1", 8, 360, this.y, termRows[index]!);
      }
      if (expiryRows[index]) {
        this.text("F1", 8, 470, this.y, expiryRows[index]!);
      }
      this.y -= 11;
    }
    this.y -= 3;
  }
}

function wrapPdfText(value: string, maxChars: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [""];
  }
  const words = normalized.split(" ");
  const rows: string[] = [];
  let row = "";
  for (const word of words) {
    const pieces = word.length > maxChars ? splitLongWord(word, maxChars) : [word];
    for (const piece of pieces) {
      const candidate = row ? `${row} ${piece}` : piece;
      if (candidate.length > maxChars && row) {
        rows.push(row);
        row = piece;
      } else {
        row = candidate;
      }
    }
  }
  if (row) {
    rows.push(row);
  }
  return rows.length ? rows : [normalized];
}

function splitLongWord(word: string, maxChars: number) {
  const pieces: string[] = [];
  for (let index = 0; index < word.length; index += maxChars) {
    pieces.push(word.slice(index, index + maxChars));
  }
  return pieces;
}

function renderPdfDocument(
  pageStreams: string[],
  logo: { jpegBuffer: Buffer; width: number; height: number } | null,
) {
  const streams = pageStreams.map((stream, index) => {
    if (index === 0 && logo) {
      return `q 36 0 0 36 46 756 cm /Im1 Do Q\n${stream}`;
    }
    return stream;
  });
  const pageCount = streams.length;
  let nextId = 3;
  const pageIds: number[] = [];
  const contentIds: number[] = [];
  for (let index = 0; index < pageCount; index += 1) {
    pageIds.push(nextId);
    nextId += 1;
    contentIds.push(nextId);
    nextId += 1;
  }
  const font1 = nextId;
  nextId += 1;
  const font2 = nextId;
  nextId += 1;
  const imageId = logo ? nextId : null;
  if (logo) {
    nextId += 1;
  }
  const objectCount = nextId - 1;
  const objects: Array<Buffer | string> = new Array(objectCount);

  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Count ${pageCount} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;

  for (let index = 0; index < pageCount; index += 1) {
    const xobject = index === 0 && imageId ? ` /XObject << /Im1 ${imageId} 0 R >>` : "";
    const resources = `<< /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >>${xobject} >>`;
    objects[pageIds[index]! - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents ${contentIds[index]} 0 R /Resources ${resources} >>`;
    const stream = streams[index]!;
    objects[contentIds[index]! - 1] =
      `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`;
  }

  objects[font1 - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[font2 - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  if (logo && imageId) {
    const header =
      `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} `
      + `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.jpegBuffer.length} >>\nstream\n`;
    objects[imageId - 1] = Buffer.concat([
      Buffer.from(header, "utf8"),
      logo.jpegBuffer,
      Buffer.from("\nendstream", "utf8"),
    ]);
  }

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n", "utf8")];
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    const body = objects[index];
    const objectBuffer = Buffer.isBuffer(body)
      ? Buffer.concat([
        Buffer.from(`${index + 1} 0 obj\n`, "utf8"),
        body,
        Buffer.from("\nendobj\n", "utf8"),
      ])
      : Buffer.from(`${index + 1} 0 obj\n${body}\nendobj\n`, "utf8");
    chunks.push(objectBuffer);
  }

  const xrefStart = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    xref += `${offsets[index]!.toString().padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  chunks.push(Buffer.from(xref, "utf8"));
  return Buffer.concat(chunks);
}
