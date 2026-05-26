import { Injectable } from "@nestjs/common";

import { PdfRenderService } from "../documents/pdf/pdf-render.service";
import type { DocumentBrandingSnapshot } from "../documents/pdf/pdf-render.types";

type InvoicePdfLineItem = {
  name: string;
  description?: string | null;
  quantity: string;
  rateLabel: string;
  amountLabel: string;
};

export type InvoicePdfBrandingSnapshot = Omit<DocumentBrandingSnapshot, "companyAddress">;

export type InvoicePdfRenderInput = {
  documentNumber: string;
  lifecycleStatus: string;
  issuedAtLabel: string;
  dueAtLabel: string | null;
  generatedAtIso: string;
  customerName: string;
  customerCompany: string | null;
  customerAddressLines: string[];
  customerEmail: string | null;
  customerPhone: string | null;
  serviceAddressLines: string[];
  description: string | null;
  lineItems: InvoicePdfLineItem[];
  subtotalLabel: string;
  taxLabel: string;
  taxAmountLabel: string;
  totalLabel: string;
  paidLabel: string | null;
  balanceLabel: string | null;
  branding: InvoicePdfBrandingSnapshot;
};

@Injectable()
export class InvoicePdfService {
  constructor(private readonly pdfRenderService: PdfRenderService) {}

  renderInvoicePdf(input: InvoicePdfRenderInput) {
    const content = this.buildInvoicePdfContent(input);
    return this.pdfRenderService.renderContentStream(content, {
      fonts: [
        { name: "F1", baseFont: "Helvetica" },
        { name: "F2", baseFont: "Helvetica-Bold" },
      ],
    });
  }

  private buildInvoicePdfContent(input: InvoicePdfRenderInput) {
    const left = 46;
    const right = 548;
    let y = 804;
    const out: string[] = [];

    const text = (font: "F1" | "F2", size: number, x: number, yPos: number, value: string) => {
      out.push("BT");
      out.push(`/${font} ${size} Tf`);
      out.push(`${x} ${yPos} Td`);
      out.push(`(${this.pdfRenderService.escapeText(value)}) Tj`);
      out.push("ET");
    };

    const textRight = (font: "F1" | "F2", size: number, yPos: number, value: string, anchor = right) => {
      const approxWidth = value.length * size * 0.49;
      const x = Math.max(left, anchor - approxWidth);
      text(font, size, x, yPos, value);
    };

    const rule = (yPos: number, lineWidth = 0.6) => {
      out.push(`${lineWidth} w`);
      out.push(`${left} ${yPos} m`);
      out.push(`${right} ${yPos} l`);
      out.push("S");
    };

    const wrap = (value: string, maxChars: number) => {
      const words = value.trim().split(/\s+/);
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length > maxChars && current) {
          lines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
      if (current) {
        lines.push(current);
      }
      return lines.length ? lines : [value];
    };

    const writeWrapped = (font: "F1" | "F2", size: number, x: number, maxChars: number, value: string, step: number) => {
      const lines = wrap(value, maxChars);
      for (const line of lines) {
        text(font, size, x, y, line);
        y -= step;
      }
    };

    const brandingTitle = input.branding.businessName ?? "Service Business";
    const businessMeta = [
      input.branding.phone,
      input.branding.email,
      input.branding.website,
    ].filter((entry): entry is string => Boolean(entry && entry.trim()));
    const businessLegal = [
      input.branding.businessLicense ? `License: ${input.branding.businessLicense}` : null,
      input.branding.gstNumber ? `Tax ID: ${input.branding.gstNumber}` : null,
    ].filter((entry): entry is string => Boolean(entry));

    text("F2", 15, left, y, brandingTitle);
    y -= 13;
    for (const line of businessMeta) {
      text("F1", 9, left, y, line);
      y -= 11;
    }
    for (const line of businessLegal) {
      text("F1", 8, left, y, line);
      y -= 10;
    }

    const headerTop = 804;
    textRight("F2", 24, headerTop, "INVOICE");
    textRight("F1", 10, headerTop - 20, `# ${input.documentNumber}`);
    textRight("F1", 9, headerTop - 34, `Status: ${input.lifecycleStatus.toUpperCase()}`);
    textRight("F1", 9, headerTop - 46, `Issued: ${input.issuedAtLabel}`);
    if (input.dueAtLabel) {
      textRight("F1", 9, headerTop - 58, `Due: ${input.dueAtLabel}`);
    }

    y = Math.min(y - 6, 732);
    rule(y);
    y -= 18;

    text("F2", 10, left, y, "Bill To");
    text("F2", 10, 322, y, "Service Address");
    y -= 14;

    const billLines = [
      input.customerName,
      input.customerCompany,
      ...input.customerAddressLines,
      input.customerEmail,
      input.customerPhone,
    ].filter((entry): entry is string => Boolean(entry && entry.trim()));
    const serviceLines = input.serviceAddressLines.filter((entry) => entry.trim().length > 0);
    const maxRows = Math.max(billLines.length, serviceLines.length, 1);

    for (let index = 0; index < maxRows; index += 1) {
      if (billLines[index]) {
        text("F1", 9, left, y, billLines[index]);
      }
      if (serviceLines[index]) {
        text("F1", 9, 322, y, serviceLines[index]);
      }
      y -= 12;
    }

    y -= 6;
    rule(y, 0.5);
    y -= 16;

    if (input.description) {
      text("F2", 9, left, y, "Summary");
      y -= 12;
      writeWrapped("F1", 8, left, 110, input.description, 10);
      y -= 6;
    }

    text("F2", 8, left, y, "Description");
    text("F2", 8, 360, y, "Qty");
    text("F2", 8, 406, y, "Rate");
    text("F2", 8, 480, y, "Amount");
    y -= 10;
    rule(y, 0.4);
    y -= 11;

    for (const item of input.lineItems) {
      const detailLines = [item.name, ...(item.description ? wrap(item.description, 64).map((line) => `  ${line}`) : [])];
      const firstLine = detailLines.shift() ?? item.name;
      text("F1", 8, left, y, firstLine);
      text("F1", 8, 360, y, item.quantity);
      text("F1", 8, 406, y, item.rateLabel);
      text("F1", 8, 480, y, item.amountLabel);
      y -= 11;
      for (const line of detailLines) {
        text("F1", 7, left, y, line);
        y -= 9;
      }
      y -= 3;
    }

    y -= 4;
    const totalsLabelX = 392;
    const totalsValueX = right;
    text("F1", 9, totalsLabelX, y, "Subtotal");
    textRight("F1", 9, y, input.subtotalLabel, totalsValueX);
    y -= 13;
    text("F1", 9, totalsLabelX, y, input.taxLabel);
    textRight("F1", 9, y, input.taxAmountLabel, totalsValueX);
    y -= 9;
    rule(y, 0.5);
    y -= 13;
    text("F2", 11, totalsLabelX, y, "Total");
    textRight("F2", 11, y, input.totalLabel, totalsValueX);
    y -= 14;
    if (input.paidLabel) {
      text("F1", 9, totalsLabelX, y, "Paid");
      textRight("F1", 9, y, input.paidLabel, totalsValueX);
      y -= 12;
    }
    if (input.balanceLabel) {
      text("F2", 9, totalsLabelX, y, "Balance Due");
      textRight("F2", 9, y, input.balanceLabel, totalsValueX);
      y -= 12;
    }

    y = Math.max(104, y - 6);
    rule(y);
    y -= 12;

    text("F1", 8, left, y, input.branding.invoicePdfFooter?.trim() || "Thank you for your business.");
    y -= 10;

    if (input.branding.paymentInstructions?.trim()) {
      text("F2", 8, left, y, "Payment Instructions");
      y -= 10;
      writeWrapped("F1", 7, left, 112, input.branding.paymentInstructions.trim(), 9);
      y -= 3;
    }

    if (input.branding.warrantyMessage?.trim()) {
      text("F2", 8, left, y, "Warranty");
      y -= 10;
      writeWrapped("F1", 7, left, 112, input.branding.warrantyMessage.trim(), 9);
      y -= 3;
    }

    text("F1", 6, left, 34, `Generated ${input.generatedAtIso}`);
    return out.join("\n");
  }
}
