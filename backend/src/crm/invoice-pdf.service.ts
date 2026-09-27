import { Injectable } from "@nestjs/common";

import { PdfRenderService } from "../documents/pdf/pdf-render.service";
import {
  buildLogoInitialsFallback,
  loadInvoiceDocumentLogoSync,
} from "./invoice-document-logo.loader";
import type { PhoenixInvoiceDocumentViewModel } from "./phoenix-invoice-document-view-model.types";

import type { DocumentBrandingSnapshot } from "../documents/pdf/pdf-render.types";

/** @deprecated Use PhoenixInvoiceDocumentViewModel business_header — kept for branding snapshot helpers */
export type InvoicePdfBrandingSnapshot = Omit<DocumentBrandingSnapshot, "companyAddress"> & {
  companyAddress?: string | null;
};

export type InvoicePdfRenderInput = PhoenixInvoiceDocumentViewModel;

@Injectable()
export class InvoicePdfService {
  constructor(private readonly pdfRenderService: PdfRenderService) {}

  renderInvoicePdf(input: PhoenixInvoiceDocumentViewModel) {
    const logo = loadInvoiceDocumentLogoSync(input.business_header.logo_url);
    const content = this.buildInvoicePdfContent(input, logo);
    if (logo) {
      return this.pdfRenderService.renderContentStreamWithJpegLogo(content, {
        fonts: [
          { name: "F1", baseFont: "Helvetica" },
          { name: "F2", baseFont: "Helvetica-Bold" },
        ],
        logo: {
          jpegBuffer: logo.jpegBuffer,
          width: logo.width,
          height: logo.height,
          x: 46,
          y: 760,
          displayWidth: 48,
          displayHeight: 48,
        },
      });
    }

    return this.pdfRenderService.renderContentStream(content, {
      fonts: [
        { name: "F1", baseFont: "Helvetica" },
        { name: "F2", baseFont: "Helvetica-Bold" },
      ],
    });
  }

  private buildInvoicePdfContent(
    input: PhoenixInvoiceDocumentViewModel,
    logo: ReturnType<typeof loadInvoiceDocumentLogoSync>,
  ) {
    const left = logo ? 102 : 46;
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

    if (!logo) {
      const initials = buildLogoInitialsFallback(
        input.business_header.business_name,
        input.business_header.display_initials,
      );
      text("F2", 10, 46, 792, initials);
    }

    const brandingTitle = input.business_header.business_name ?? "Service Business";
    const businessMeta = [
      input.business_header.company_address,
      input.business_header.phone,
      input.business_header.email,
      input.business_header.website,
    ].filter((entry): entry is string => Boolean(entry && entry.trim()));
    const businessLegal = [
      input.business_header.business_license ? `License: ${input.business_header.business_license}` : null,
      input.business_header.gst_number ? `Tax ID: ${input.business_header.gst_number}` : null,
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
    textRight("F1", 10, headerTop - 20, `# ${input.document_meta.document_number}`);
    if (input.show_draft_banner) {
      textRight("F2", 10, headerTop - 34, "DRAFT — NOT ISSUED");
    } else {
      textRight("F1", 9, headerTop - 34, `Status: ${input.document_meta.lifecycle_status.toUpperCase()}`);
    }
    textRight("F1", 9, headerTop - (input.show_draft_banner ? 48 : 46), `Issued: ${input.document_meta.issued_at_label}`);
    if (input.document_meta.due_at_label) {
      textRight("F1", 9, headerTop - (input.show_draft_banner ? 60 : 58), `Due: ${input.document_meta.due_at_label}`);
    }

    y = Math.min(y - 6, 732);
    rule(y);
    y -= 18;

    text("F2", 10, left, y, "Bill To");
    text("F2", 10, 322, y, "Service Location");
    y -= 14;

    const billLines = [
      input.bill_to.name,
      input.bill_to.company,
      ...input.bill_to.address_lines,
      input.bill_to.email,
      input.bill_to.phone,
    ].filter((entry): entry is string => Boolean(entry && entry.trim()));
    const serviceLines = input.service_location.address_lines.filter((entry) => entry.trim().length > 0);
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

    if (input.job_reference.label) {
      text("F2", 9, left, y, "Job / Service");
      y -= 12;
      writeWrapped("F1", 8, left, 110, input.job_reference.label, 10);
      y -= 6;
    }

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

    for (const item of input.line_items) {
      const detailLines = [
        item.name,
        ...(item.description ? wrap(item.description, 64).map((line) => `  ${line}`) : []),
      ];
      const firstLine = detailLines.shift() ?? item.name;
      text("F1", 8, left, y, firstLine);
      text("F1", 8, 360, y, item.quantity);
      text("F1", 8, 406, y, item.unit_price_label);
      text("F1", 8, 480, y, item.line_subtotal_label);
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
    textRight("F1", 9, y, input.financial_summary.subtotal_label, totalsValueX);
    y -= 13;
    if (input.financial_summary.discount_label) {
      text("F1", 9, totalsLabelX, y, "Discount");
      textRight("F1", 9, y, input.financial_summary.discount_label, totalsValueX);
      y -= 13;
    }
    text("F1", 9, totalsLabelX, y, input.financial_summary.tax_label);
    textRight("F1", 9, y, input.financial_summary.tax_amount_label, totalsValueX);
    y -= 9;
    rule(y, 0.5);
    y -= 13;
    text("F2", 11, totalsLabelX, y, "Total");
    textRight("F2", 11, y, input.financial_summary.total_label, totalsValueX);
    y -= 14;
    if (input.balance_due.paid_label) {
      text("F1", 9, totalsLabelX, y, "Paid");
      textRight("F1", 9, y, input.balance_due.paid_label, totalsValueX);
      y -= 12;
    }
    if (input.balance_due.balance_label) {
      text("F2", 9, totalsLabelX, y, "Balance Due");
      textRight("F2", 9, y, input.balance_due.balance_label, totalsValueX);
      y -= 12;
    }
    if (input.balance_due.overpayment_label) {
      text("F2", 9, totalsLabelX, y, "Overpayment");
      textRight("F2", 9, y, input.balance_due.overpayment_label, totalsValueX);
      y -= 12;
    }

    if (input.payments_ledger.payments.length > 0) {
      y -= 4;
      text("F2", 9, left, y, "Payments");
      y -= 12;
      for (const payment of input.payments_ledger.payments.slice(0, 6)) {
        const label = `${payment.occurred_at_label} · ${payment.method} · ${payment.amount_label}`;
        text("F1", 8, left, y, label);
        y -= 10;
      }
    }

    y = Math.max(104, y - 6);
    rule(y);
    y -= 12;

    const footerText = input.copy_blocks.footer?.trim() || "Thank you for your business.";
    text("F1", 8, left, y, footerText);
    y -= 10;

    if (input.copy_blocks.payment_instructions?.trim()) {
      text("F2", 8, left, y, "Payment Instructions");
      y -= 10;
      writeWrapped("F1", 7, left, 112, input.copy_blocks.payment_instructions.trim(), 9);
      y -= 3;
    }

    if (input.copy_blocks.warranty_text?.trim()) {
      text("F2", 8, left, y, "Warranty");
      y -= 10;
      writeWrapped("F1", 7, left, 112, input.copy_blocks.warranty_text.trim(), 9);
      y -= 3;
    }

    if (input.copy_blocks.terms_text?.trim() && input.copy_blocks.terms_text !== input.copy_blocks.footer) {
      text("F2", 8, left, y, "Terms");
      y -= 10;
      writeWrapped("F1", 7, left, 112, input.copy_blocks.terms_text.trim(), 9);
      y -= 3;
    }

    text("F1", 6, left, 34, `Generated ${input.footer.generated_at}`);
    return out.join("\n");
  }
}
