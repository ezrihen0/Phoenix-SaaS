import { Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import { createReadStream } from "fs";
import { copyFile, mkdir, readFile, rename, unlink } from "fs/promises";
import { join } from "path";
import { DataSource, EntityManager, QueryFailedError, Repository } from "typeorm";

import { apiError } from "../../common/api-response";
import { InvoiceDocumentEntity } from "../../database/entities/invoice-document.entity";
import { InvoiceEntity } from "../../database/entities/invoice.entity";
import { JobEntity } from "../../database/entities/job.entity";

export const INVOICE_DOCUMENTS_UPLOAD_ROOT = join(process.cwd(), "uploads", "invoice-documents");
export const INVOICE_DOCUMENTS_PENDING_ROOT = join(INVOICE_DOCUMENTS_UPLOAD_ROOT, ".pending");

export type AttachInvoicePdfInput = {
  organizationId: string;
  customerId: string;
  invoiceId: string;
  sourceFilePath: string;
  originalFilename: string;
  fileHash: string;
  workizInvoiceCode: string | null;
  testHooks?: AttachInvoicePdfTestHooks;
};

export type AttachInvoicePdfTestHooks = {
  beforeDocumentInsert?: (manager: EntityManager) => void | Promise<void>;
  afterDocumentInsert?: (manager: EntityManager) => void | Promise<void>;
  beforeProvenanceUpdate?: (manager: EntityManager) => void | Promise<void>;
  beforeCommit?: () => void | Promise<void>;
};

export type AttachInvoicePdfResult =
  | { action: "stored"; document: InvoiceDocumentEntity }
  | { action: "skipped_duplicate"; document: InvoiceDocumentEntity };

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
export class InvoiceDocumentsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(InvoiceDocumentEntity)
    private readonly invoiceDocumentsRepository: Repository<InvoiceDocumentEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoicesRepository: Repository<InvoiceEntity>,
    @InjectRepository(JobEntity)
    private readonly jobsRepository: Repository<JobEntity>,
  ) {}

  async attachWorkizSourcePdf(input: AttachInvoicePdfInput): Promise<AttachInvoicePdfResult> {
    await this.validateAttachOwnership(input);

    const existing = await this.findExistingDocument(input);
    if (existing) {
      return { action: "skipped_duplicate", document: existing };
    }

    await mkdir(INVOICE_DOCUMENTS_PENDING_ROOT, { recursive: true });
    await mkdir(INVOICE_DOCUMENTS_UPLOAD_ROOT, { recursive: true });

    const documentId = randomUUID();
    const storageKey = `${input.organizationId}/${input.invoiceId}/${documentId}.pdf`;
    const storagePath = join(INVOICE_DOCUMENTS_UPLOAD_ROOT, `${documentId}.pdf`);
    const stagedPath = join(INVOICE_DOCUMENTS_PENDING_ROOT, `${documentId}.pdf`);

    try {
      await copyFile(input.sourceFilePath, stagedPath);
    } catch {
      apiError(400, "invoice_document_storage_failed", "The invoice PDF could not be copied to durable storage.");
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    let finalPathCreated = false;

    try {
      await queryRunner.startTransaction();
      const manager = queryRunner.manager;

      const invoice = await manager.getRepository(InvoiceEntity).findOne({
        where: {
          id: input.invoiceId,
          organization_id: input.organizationId,
        },
      });
      if (!invoice) {
        apiError(404, "invoice_not_found", "The invoice could not be found.");
      }

      const racedDuplicate = await this.findExistingDocument(input, manager);
      if (racedDuplicate) {
        await queryRunner.rollbackTransaction();
        await safeUnlink(stagedPath);
        return { action: "skipped_duplicate", document: racedDuplicate };
      }

      await input.testHooks?.beforeDocumentInsert?.(manager);

      let document: InvoiceDocumentEntity;
      try {
        document = await manager.getRepository(InvoiceDocumentEntity).save(
          manager.getRepository(InvoiceDocumentEntity).create({
            id: documentId,
            organization_id: input.organizationId,
            customer_id: input.customerId,
            invoice_id: input.invoiceId,
            document_kind: "workiz_source_pdf",
            storage_key: storageKey,
            storage_path: storagePath,
            file_hash: input.fileHash,
            original_filename: input.originalFilename,
            mime_type: "application/pdf",
            import_source: "workiz_historical_import",
            workiz_invoice_code: input.workizInvoiceCode,
          }),
        );
      } catch (error) {
        if (isDuplicateEntryError(error)) {
          await queryRunner.rollbackTransaction();
          await safeUnlink(stagedPath);
          const duplicate = await this.findExistingDocument(input);
          if (duplicate) {
            return { action: "skipped_duplicate", document: duplicate };
          }
        }
        throw error;
      }

      await input.testHooks?.afterDocumentInsert?.(manager);
      await input.testHooks?.beforeProvenanceUpdate?.(manager);
      await this.linkDocumentToInvoiceProvenanceInTransaction(manager, document);

      await rename(stagedPath, storagePath);
      finalPathCreated = true;

      await input.testHooks?.beforeCommit?.();

      await queryRunner.commitTransaction();
      return { action: "stored", document };
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
        const duplicate = await this.findExistingDocument(input);
        if (duplicate) {
          return { action: "skipped_duplicate", document: duplicate };
        }
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getInvoiceForPortal(invoiceId: string, organizationId: string, customerId: string) {
    const invoice = await this.invoicesRepository.findOne({
      where: { id: invoiceId, organization_id: organizationId },
    });
    if (!invoice) {
      apiError(404, "invoice_not_found", "The invoice could not be found.");
    }

    const job = await this.jobsRepository.findOne({
      where: {
        id: invoice.job_id,
        organization_id: organizationId,
        customer_id: customerId,
      },
    });
    if (!job) {
      apiError(404, "invoice_not_found", "The invoice could not be found.");
    }

    const document = await this.invoiceDocumentsRepository.findOne({
      where: {
        invoice_id: invoice.id,
        organization_id: organizationId,
        customer_id: customerId,
        document_kind: "workiz_source_pdf",
      },
    });

    return { invoice, document };
  }

  async readPdfBuffer(document: InvoiceDocumentEntity): Promise<Buffer> {
    try {
      return await readFile(document.storage_path);
    } catch {
      apiError(404, "invoice_document_missing", "The invoice PDF file could not be found.");
    }
  }

  createPdfReadStream(document: InvoiceDocumentEntity) {
    try {
      return createReadStream(document.storage_path);
    } catch {
      apiError(404, "invoice_document_missing", "The invoice PDF file could not be found.");
    }
  }

  async listPortalDocumentsForCustomer(organizationId: string, customerId: string) {
    return this.invoiceDocumentsRepository.find({
      where: {
        organization_id: organizationId,
        customer_id: customerId,
        document_kind: "workiz_source_pdf",
      },
      order: { created_at: "DESC" },
    });
  }

  private async validateAttachOwnership(input: AttachInvoicePdfInput) {
    const invoice = await this.invoicesRepository.findOne({
      where: {
        id: input.invoiceId,
        organization_id: input.organizationId,
      },
    });
    if (!invoice) {
      apiError(404, "invoice_not_found", "The invoice could not be found.");
    }

    const job = await this.jobsRepository.findOne({
      where: {
        id: invoice.job_id,
        organization_id: input.organizationId,
        customer_id: input.customerId,
      },
    });
    if (!job) {
      apiError(403, "invoice_document_attach_forbidden", "Invoice ownership could not be verified for document attach.");
    }
  }

  private async findExistingDocument(
    input: AttachInvoicePdfInput,
    manager?: EntityManager,
  ) {
    const repository = manager
      ? manager.getRepository(InvoiceDocumentEntity)
      : this.invoiceDocumentsRepository;

    const existing = await repository.findOne({
      where: {
        organization_id: input.organizationId,
        invoice_id: input.invoiceId,
        document_kind: "workiz_source_pdf",
      },
    });
    if (existing) {
      return existing;
    }

    return repository.findOne({
      where: {
        organization_id: input.organizationId,
        invoice_id: input.invoiceId,
        file_hash: input.fileHash,
      },
    });
  }

  private async linkDocumentToInvoiceProvenanceInTransaction(
    manager: EntityManager,
    document: InvoiceDocumentEntity,
  ) {
    if (!document.organization_id) {
      apiError(403, "invoice_document_provenance_forbidden", "Invoice document organization ownership is missing.");
    }

    const invoice = await manager.getRepository(InvoiceEntity).findOne({
      where: {
        id: document.invoice_id,
        organization_id: document.organization_id,
      },
    });
    if (!invoice) {
      apiError(403, "invoice_document_provenance_forbidden", "Invoice provenance ownership could not be verified.");
    }

    if (!invoice.branding_snapshot_json) {
      apiError(400, "invoice_document_provenance_missing", "Invoice provenance snapshot is missing.");
    }

    let snapshot: Record<string, unknown>;
    try {
      snapshot = JSON.parse(invoice.branding_snapshot_json) as Record<string, unknown>;
    } catch {
      apiError(400, "invoice_document_provenance_invalid", "Invoice provenance snapshot is invalid.");
    }

    const pdfEnrichment = (snapshot.pdf_enrichment ?? {}) as Record<string, unknown>;
    snapshot.pdf_enrichment = {
      ...pdfEnrichment,
      invoice_document_id: document.id,
      source_pdf_storage_key: document.storage_key,
    };
    invoice.branding_snapshot_json = JSON.stringify(snapshot);
    await manager.getRepository(InvoiceEntity).save(invoice);
  }
}
