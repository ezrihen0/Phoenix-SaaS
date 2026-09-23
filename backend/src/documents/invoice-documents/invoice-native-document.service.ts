import { Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { createHash, randomUUID } from "crypto";
import { mkdir, rename, writeFile, unlink } from "fs/promises";
import { join } from "path";
import { DataSource, EntityManager, Repository } from "typeorm";

import { InvoiceDocumentEntity } from "../../database/entities/invoice-document.entity";
import type { InvoiceEntity } from "../../database/entities/invoice.entity";
import type { InvoiceCustomerFacingSnapshot } from "../../crm/invoice-customer-facing-snapshot.types";
import { INVOICE_DOCUMENTS_PENDING_ROOT, INVOICE_DOCUMENTS_UPLOAD_ROOT } from "./invoice-documents.service";

export const INVOICE_PDF_RENDERER_VERSION = "invoice-pdf-v2";

@Injectable()
export class InvoiceNativeDocumentService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(InvoiceDocumentEntity)
    private readonly invoiceDocumentsRepository: Repository<InvoiceDocumentEntity>,
  ) {}

  persistNativePdfAfterSend(input: {
    organizationId: string;
    customerId: string;
    invoice: InvoiceEntity;
    pdfBuffer: Buffer;
    snapshot: InvoiceCustomerFacingSnapshot;
    sentVia: string;
  }) {
    return this.dataSource.transaction((manager) => this.persistNativePdfInTransaction(manager, input));
  }

  async persistNativePdfInTransaction(
    manager: EntityManager,
    input: {
      organizationId: string;
      customerId: string;
      invoice: InvoiceEntity;
      pdfBuffer: Buffer;
      snapshot: InvoiceCustomerFacingSnapshot;
      sentVia: string;
    },
  ) {
    const snapshotHash = createHash("sha256").update(JSON.stringify(input.snapshot)).digest("hex");
    const documentRepo = manager.getRepository(InvoiceDocumentEntity);

    const duplicate = await documentRepo.findOne({
      where: {
        organization_id: input.organizationId,
        invoice_id: input.invoice.id,
        document_kind: "native_customer_pdf",
        snapshot_hash: snapshotHash,
        renderer_version: INVOICE_PDF_RENDERER_VERSION,
      },
    });
    if (duplicate) {
      return duplicate;
    }

    const latest = await documentRepo.findOne({
      where: {
        organization_id: input.organizationId,
        invoice_id: input.invoice.id,
        document_kind: "native_customer_pdf",
      },
      order: {
        generation_sequence: "DESC",
      },
    });
    const generationSequence = (latest?.generation_sequence ?? 0) + 1;

    await mkdir(INVOICE_DOCUMENTS_PENDING_ROOT, { recursive: true });
    await mkdir(INVOICE_DOCUMENTS_UPLOAD_ROOT, { recursive: true });

    const documentId = randomUUID();
    const storageKey = `${input.organizationId}/${input.invoice.id}/${documentId}.pdf`;
    const storagePath = join(INVOICE_DOCUMENTS_UPLOAD_ROOT, `${documentId}.pdf`);
    const stagedPath = join(INVOICE_DOCUMENTS_PENDING_ROOT, `${documentId}.pdf`);
    const fileHash = createHash("sha256").update(input.pdfBuffer).digest("hex");

    try {
      await writeFile(stagedPath, input.pdfBuffer);
      await rename(stagedPath, storagePath);
    } catch {
      await unlink(stagedPath).catch(() => undefined);
      throw new Error("invoice_native_pdf_storage_failed");
    }

    const documentNumber = input.snapshot.document_number;
    return documentRepo.save(
      documentRepo.create({
        id: documentId,
        organization_id: input.organizationId,
        customer_id: input.customerId,
        invoice_id: input.invoice.id,
        document_kind: "native_customer_pdf",
        generation_sequence: generationSequence,
        snapshot_hash: snapshotHash,
        snapshot_frozen_at: new Date(input.snapshot.frozen_at),
        document_number_at_generation: documentNumber,
        sent_via: input.sentVia,
        renderer_version: INVOICE_PDF_RENDERER_VERSION,
        storage_key: storageKey,
        storage_path: storagePath,
        file_hash: fileHash,
        original_filename: `invoice-${documentNumber}.pdf`,
        mime_type: "application/pdf",
        import_source: "native_wizfield",
        workiz_invoice_code: null,
      }),
    );
  }

  findLatestNativeDocument(organizationId: string, invoiceId: string) {
    return this.invoiceDocumentsRepository.findOne({
      where: {
        organization_id: organizationId,
        invoice_id: invoiceId,
        document_kind: "native_customer_pdf",
      },
      order: {
        generation_sequence: "DESC",
      },
    });
  }
}
