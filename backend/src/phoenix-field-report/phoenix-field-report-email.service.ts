import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { Repository } from "typeorm";

import { EmailService } from "../email/email.service";
import { PhoenixFieldHistoricalReportBatchEntity } from "../database/entities/phoenix-field-historical-report-batch.entity";
import { PhoenixFieldReportPdfService } from "./phoenix-field-report-pdf.service";

@Injectable()
export class PhoenixFieldReportEmailService {
  constructor(
    private readonly emailService: EmailService,
    private readonly pdfService: PhoenixFieldReportPdfService,
    @InjectRepository(PhoenixFieldHistoricalReportBatchEntity)
    private readonly batchRepository: Repository<PhoenixFieldHistoricalReportBatchEntity>,
  ) {}

  private uploadsRoot() {
    return join(process.cwd(), "uploads", "michael-field-reports");
  }

  async persistPdf(batchId: string) {
    const pdfBuffer = await this.pdfService.renderBatchPdf(batchId);
    const dir = this.uploadsRoot();
    await mkdir(dir, { recursive: true });
    const storageKey = `${batchId}.pdf`;
    const fullPath = join(dir, storageKey);
    await writeFile(fullPath, pdfBuffer);
    return storageKey;
  }

  async sendReportEmail(batchId: string) {
    const batch = await this.batchRepository.findOne({ where: { id: batchId } });
    if (!batch) {
      throw new Error("batch_not_found");
    }

    if (!batch.report_recipient_email?.trim()) {
      throw new Error("report_recipient_email_missing");
    }

    if (!this.emailService.isConfigured()) {
      batch.status = batch.status.startsWith("import") ? "email_failed" : batch.status;
      batch.email_last_error = "Email service is not configured.";
      await this.batchRepository.save(batch);
      return { ok: false as const, error: batch.email_last_error };
    }

    const storageKey = batch.pdf_storage_key ?? (await this.persistPdf(batchId));
    batch.pdf_storage_key = storageKey;
    batch.status = "email_pending";
    await this.batchRepository.save(batch);

    const pdfBuffer = await this.pdfService.renderBatchPdf(batchId);

    try {
      const result = await this.emailService.send({
        to: batch.report_recipient_email.trim(),
        subject: "Phoenix Fireplace — Historical Field Work Report",
        body: "Your historical field work report is attached. CRM records were saved separately from this email delivery.",
        html: "<p>Your historical field work report is attached. CRM records were saved separately from this email delivery.</p>",
        attachments: [
          {
            filename: `phoenix-field-report-${batchId.slice(0, 8)}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
      });

      batch.email_message_id = result.messageId ?? null;
      batch.email_sent_at = result.sentAt;
      batch.email_provider_accepted_at = result.sentAt;
      batch.email_last_error = null;
      batch.status = "email_sent";
      await this.batchRepository.save(batch);

      return { ok: true as const, messageId: result.messageId ?? null };
    } catch (error) {
      batch.status = "email_failed";
      batch.email_last_error = error instanceof Error ? error.message : "Email delivery failed.";
      await this.batchRepository.save(batch);
      return { ok: false as const, error: batch.email_last_error };
    }
  }
}
