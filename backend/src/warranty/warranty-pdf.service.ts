import { Injectable } from "@nestjs/common";

import { PdfRenderService } from "../documents/pdf/pdf-render.service";

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

@Injectable()
export class WarrantyPdfService {
  constructor(private readonly pdfRenderService: PdfRenderService) {}

  render(snapshot: WarrantyCertificatePdfSnapshot) {
    const content = this.buildContent(snapshot);
    return this.pdfRenderService.renderContentStream(content, {
      fonts: [
        { name: "F1", baseFont: "Helvetica" },
        { name: "F2", baseFont: "Helvetica-Bold" },
      ],
    });
  }

  private buildContent(input: WarrantyCertificatePdfSnapshot) {
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
