import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";

import { OrganizationInvoiceSequenceEntity } from "../database/entities/organization-invoice-sequence.entity";
import type { InvoiceEntity } from "../database/entities/invoice.entity";

const DEFAULT_SEQUENCE_START = 1001;

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

    const sequenceRepo = manager.getRepository(OrganizationInvoiceSequenceEntity);
    let sequence = await sequenceRepo.findOne({
      where: { organization_id: organizationId },
      lock: { mode: "pessimistic_write" },
    });

    if (!sequence) {
      sequence = sequenceRepo.create({
        organization_id: organizationId,
        next_value: String(DEFAULT_SEQUENCE_START),
        prefix: "",
      });
      await sequenceRepo.save(sequence);
      sequence = await sequenceRepo.findOneOrFail({
        where: { organization_id: organizationId },
        lock: { mode: "pessimistic_write" },
      });
    }

    const numericValue = Number(sequence.next_value);
    const assigned = `${sequence.prefix ?? ""}${numericValue}`;
    sequence.next_value = String(numericValue + 1);
    await sequenceRepo.save(sequence);

    invoice.document_number = assigned;
    return assigned;
  }
}
