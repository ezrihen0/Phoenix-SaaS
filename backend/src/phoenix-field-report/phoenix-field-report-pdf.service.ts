import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { PdfRenderService } from "../documents/pdf/pdf-render.service";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { PhoenixFieldHistoricalReportBatchEntity } from "../database/entities/phoenix-field-historical-report-batch.entity";
import type { MichaelReportJobPayload } from "./phoenix-field-report.types";
import { aggregateEntryFinancials } from "./phoenix-field-report-financials";
import { PhoenixFieldReportFinancialsService } from "./phoenix-field-report-financials.service";
import { dateOnlyToUtcNoon } from "./phoenix-field-report-validation";

function formatCad(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

@Injectable()
export class PhoenixFieldReportPdfService {
  constructor(
    private readonly pdfRenderService: PdfRenderService,
    private readonly financialsService: PhoenixFieldReportFinancialsService,
    @InjectRepository(PhoenixFieldHistoricalReportBatchEntity)
    private readonly batchRepository: Repository<PhoenixFieldHistoricalReportBatchEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoicesRepository: Repository<InvoiceEntity>,
  ) {}

  async renderBatchPdf(batchId: string) {
    const batch = await this.batchRepository.findOne({
      where: { id: batchId },
      relations: { entries: true },
    });

    if (!batch) {
      throw new Error("batch_not_found");
    }

    const entries = [...(batch.entries ?? [])].sort((left, right) => left.sort_order - right.sort_order);
    let y = 800;
    const lines: string[] = [];

    const pushLine = (text: string, size = 11) => {
      lines.push(`BT /F1 ${size} Tf 40 ${y} Td (${this.pdfRenderService.escapeText(text)}) Tj ET`);
      y -= size + 6;
    };

    pushLine("Phoenix Fireplace — Historical Field Work Report", 14);
    pushLine(`Batch: ${batch.id}`);
    pushLine(`Submitted: ${batch.submitted_at?.toISOString() ?? "Draft"}`);
    y -= 8;

    let receivedTotal = 0;
    const byMethod: Record<string, number> = {};
    const financialRows = [];

    for (const entry of entries) {
      const payload = entry.payload_json as unknown as MichaelReportJobPayload;
      receivedTotal += payload.amountReceivedCents;

      const method = payload.paymentMethod === "not_paid" ? "not_paid" : payload.paymentMethod;
      byMethod[method] = (byMethod[method] ?? 0) + payload.amountReceivedCents;

      const { financials } = await this.financialsService.computeForPayload(batch.organization_id, payload);
      if (financials) {
        financialRows.push(financials);
      }

      pushLine(`Job — ${payload.customerName} (${payload.workCompletedDate})`, 12);
      pushLine(`Address: ${payload.serviceAddressLine1}, ${payload.serviceCity}`);
      if (payload.customerEmail) {
        pushLine(`Customer email: ${payload.customerEmail}`);
      }

      for (const product of payload.productLines) {
        if (!product.description.trim()) {
          continue;
        }

        const warrantyNote =
          product.warrantyEnabled && product.warrantyMonths
            ? ` — warranty ${product.warrantyMonths} mo`
            : "";
        pushLine(`Sold: ${product.description}${warrantyNote}`);
      }

      pushLine(
        `Company parts: ${payload.companyParts.description} (qty ${payload.companyParts.quantity})`,
      );

      pushLine(`Customer left review: ${payload.customerLeftReview ? "Yes" : "No"}`);

      if (financials) {
        pushLine(`Sale before tax: ${formatCad(financials.saleExcludingTaxCents)} CAD`);
        pushLine(`Tax amount: ${formatCad(financials.taxCents)} CAD`);
        pushLine(`Sale including tax: ${formatCad(financials.saleIncludingTaxCents)} CAD`);
        pushLine(`Parts cost including tax: ${formatCad(financials.partsCostIncludingTaxCents)} CAD`);
        pushLine(`Remaining amount after parts: ${formatCad(financials.remainingAfterPartsCents)} CAD`);
      } else {
        pushLine(`Sale including tax: ${formatCad(payload.totalChargedCents)} CAD (tax breakdown unavailable)`);
      }

      pushLine(
        `Payment: ${payload.paymentMethod} — received ${formatCad(payload.amountReceivedCents)} CAD${
          payload.paymentDate ? ` on ${payload.paymentDate}` : ""
        }`,
      );

      if (entry.invoice_id) {
        const invoice = await this.invoicesRepository.findOne({ where: { id: entry.invoice_id } });
        pushLine(`CRM invoice: ${invoice?.document_number ?? entry.invoice_id}`);
      }

      pushLine(`Import status: ${entry.status}`);
      if (entry.last_error_message) {
        pushLine(`Error: ${entry.last_error_message}`);
      }

      for (const product of payload.productLines) {
        if (product.warrantyEnabled && product.warrantyMonths) {
          const start = dateOnlyToUtcNoon(payload.workCompletedDate);
          const end = new Date(start);
          end.setUTCMonth(end.getUTCMonth() + product.warrantyMonths);
          pushLine(`Warranty: ${product.description} — ${product.warrantyMonths} mo (to ${end.toISOString().slice(0, 10)})`);
        }
      }

      y -= 10;
    }

    const saleSummary = aggregateEntryFinancials(financialRows);

    y -= 6;
    pushLine("Report totals", 12);
    pushLine(`Sale before tax: ${formatCad(saleSummary.saleExcludingTaxCents)}`);
    pushLine(`Tax amount: ${formatCad(saleSummary.taxCents)}`);
    pushLine(`Sale including tax: ${formatCad(saleSummary.saleIncludingTaxCents)}`);
    pushLine(`Parts cost including tax: ${formatCad(saleSummary.partsCostIncludingTaxCents)}`);
    pushLine(`Remaining amount after parts: ${formatCad(saleSummary.remainingAfterPartsCents)}`);
    pushLine(`Money received: ${formatCad(receivedTotal)}`);
    pushLine(`Outstanding on sales: ${formatCad(saleSummary.saleIncludingTaxCents - receivedTotal)}`);

    for (const [method, cents] of Object.entries(byMethod)) {
      if (cents <= 0) {
        continue;
      }

      pushLine(`Received via ${method}: ${formatCad(cents)}`);
    }

    const contentStream = lines.join("\n");
    return this.pdfRenderService.renderContentStream(contentStream, {
      fonts: [{ name: "F1", baseFont: "Helvetica" }],
    });
  }
}
