import { Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { createHash, randomUUID } from "crypto";
import { mkdir, rename, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { DataSource, EntityManager, QueryFailedError, Repository } from "typeorm";

import { InvoiceDocumentEntity } from "../../database/entities/invoice-document.entity";
import type { InvoiceEntity } from "../../database/entities/invoice.entity";
import type { InvoiceCustomerFacingSnapshotAny } from "../../crm/invoice-customer-facing-snapshot.types";
import { INVOICE_DOCUMENTS_PENDING_ROOT, INVOICE_DOCUMENTS_UPLOAD_ROOT } from "./invoice-documents.service";

export const INVOICE_PDF_RENDERER_VERSION = "invoice-pdf-v2";

function isDuplicateEntryError(error: unknown) {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as { code?: string; errno?: number };
  return driverError?.errno === 1062 || driverError?.code === "ER_DUP_ENTRY";
}

async function safeUnlink(path: string | null | undefined) {
  if (!path) {
    return;
  }

  try {
    await unlink(path);
  } catch {
    // ignore missing files during compensation
  }
}

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
    snapshot: InvoiceCustomerFacingSnapshotAny;
    sentVia: string;
  }) {
    return this.persistNativePdf(input);
  }

  async persistNativePdf(input: {
    organizationId: string;
    customerId: string;
    invoice: InvoiceEntity;
    pdfBuffer: Buffer;
    snapshot: InvoiceCustomerFacingSnapshotAny;
    sentVia: string;
    manager?: EntityManager;
  }) {
    const fileHash = createHash("sha256").update(input.pdfBuffer).digest("hex");
    const existingByHash = await this.findByFileHash(
      input.organizationId,
      input.invoice.id,
      fileHash,
      input.manager,
    );
    if (existingByHash) {
      return existingByHash;
    }

    if (input.manager) {
      return this.persistNativePdfInTransaction(input.manager, { ...input, fileHash });
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await mkdir(INVOICE_DOCUMENTS_PENDING_ROOT, { recursive: true });
    await mkdir(INVOICE_DOCUMENTS_UPLOAD_ROOT, { recursive: true });

    const documentId = randomUUID();
    const storagePath = join(INVOICE_DOCUMENTS_UPLOAD_ROOT, `${documentId}.pdf`);
    const stagedPath = join(INVOICE_DOCUMENTS_PENDING_ROOT, `${documentId}.pdf`);
    let finalPathCreated = false;

    try {
      await writeFile(stagedPath, input.pdfBuffer);
      await queryRunner.startTransaction();

      const raced = await this.findByFileHash(
        input.organizationId,
        input.invoice.id,
        fileHash,
        queryRunner.manager,
      );
      if (raced) {
        await queryRunner.rollbackTransaction();
        await safeUnlink(stagedPath);
        return raced;
      }

      const document = await this.persistNativePdfInTransaction(queryRunner.manager, {
        ...input,
        fileHash,
        documentId,
        storagePath,
        stagedPath,
      });

      await rename(stagedPath, storagePath);
      finalPathCreated = true;
      await queryRunner.commitTransaction();
      return document;
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      if (finalPathCreated) {
        await safeUnlink(storagePath);
      } else {
        await safeUnlink(stagedPath);
      }

      if (isDuplicateEntryError(error)) {
        const duplicate = await this.findByFileHash(input.organizationId, input.invoice.id, fileHash);
        if (duplicate) {
          return duplicate;
        }
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async persistNativePdfInTransaction(
    manager: EntityManager,
    input: {
      organizationId: string;
      customerId: string;
      invoice: InvoiceEntity;
      pdfBuffer: Buffer;
      snapshot: InvoiceCustomerFacingSnapshotAny;
      sentVia: string;
      fileHash: string;
      documentId?: string;
      storagePath?: string;
      stagedPath?: string;
    },
  ) {
    const snapshotHash = createHash("sha256").update(JSON.stringify(input.snapshot)).digest("hex");
    const documentRepo = manager.getRepository(InvoiceDocumentEntity);

    const duplicate = await this.findByFileHash(
      input.organizationId,
      input.invoice.id,
      input.fileHash,
      manager,
    );
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

    const documentId = input.documentId ?? randomUUID();
    const storageKey = `${input.organizationId}/${input.invoice.id}/${documentId}.pdf`;
    const storagePath = input.storagePath ?? join(INVOICE_DOCUMENTS_UPLOAD_ROOT, `${documentId}.pdf`);
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
        file_hash: input.fileHash,
        original_filename: `invoice-${documentNumber}.pdf`,
        mime_type: "application/pdf",
        import_source: "native_wizfield",
        workiz_invoice_code: null,
      }),
    );
  }

  private findByFileHash(
    organizationId: string,
    invoiceId: string,
    fileHash: string,
    manager?: EntityManager,
  ) {
    const repository = manager
      ? manager.getRepository(InvoiceDocumentEntity)
      : this.invoiceDocumentsRepository;

    return repository.findOne({
      where: {
        organization_id: organizationId,
        invoice_id: invoiceId,
        file_hash: fileHash,
      },
    });
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

  listNativeDocumentsForInvoice(organizationId: string, invoiceId: string) {
    return this.invoiceDocumentsRepository.find({
      where: {
        organization_id: organizationId,
        invoice_id: invoiceId,
        document_kind: "native_customer_pdf",
      },
      order: {
        generation_sequence: "ASC",
      },
    });
  }
}
