import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";

import { OrganizationInvoiceSequenceEntity } from "../database/entities/organization-invoice-sequence.entity";
import type { InvoiceEntity } from "../database/entities/invoice.entity";

/** First business invoice number for a new organization sequence. */
export const DEFAULT_INVOICE_SEQUENCE_START = 1001;

/**
 * Phase 10 V1: organization-wide sequences only.
 * Branch-scoped numbering remains in schema but is intentionally not used until a future owner-approved phase.
 */
@Injectable()
export class InvoiceNumberingService {
  constructor(
    @InjectRepository(OrganizationInvoiceSequenceEntity)
    private readonly sequenceRepository: Repository<OrganizationInvoiceSequenceEntity>,
  ) {}

  async allocateDocumentNumberIfNeeded(
    manager: EntityManager,
    organizationId: string,
    invoice: InvoiceEntity,
  ) {
    if (invoice.document_number?.trim()) {
      return invoice.document_number.trim();
    }

    return this.allocateOrganizationDocumentNumber(manager, organizationId, invoice);
  }

  private async allocateOrganizationDocumentNumber(
    manager: EntityManager,
    organizationId: string,
    invoice: InvoiceEntity,
  ) {
    const sequenceRepo = manager.getRepository(OrganizationInvoiceSequenceEntity);
    let sequence = await sequenceRepo.findOne({
      where: { organization_id: organizationId },
      lock: { mode: "pessimistic_write" },
    });

    if (!sequence) {
      try {
        await sequenceRepo.insert({
          organization_id: organizationId,
          next_value: String(DEFAULT_INVOICE_SEQUENCE_START),
          prefix: "",
        });
      } catch {
        // Another transaction initialized the sequence row first.
      }
      sequence = await sequenceRepo.findOneOrFail({
        where: { organization_id: organizationId },
        lock: { mode: "pessimistic_write" },
      });
    }

    const numericValue = Number(sequence.next_value);
    if (!Number.isFinite(numericValue)) {
      throw new Error("invoice_sequence_corrupted");
    }

    const assigned = `${sequence.prefix ?? ""}${numericValue}`;
    sequence.next_value = String(numericValue + 1);
    await sequenceRepo.save(sequence);

    invoice.document_number = assigned;
    return assigned;
  }
}
