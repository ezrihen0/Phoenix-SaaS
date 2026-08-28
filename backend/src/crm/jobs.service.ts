import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import type { ActorContext } from "../common/request-types";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { JobEntity } from "../database/entities/job.entity";
import { QuoteEntity } from "../database/entities/quote.entity";
import {
  actorCanFilterByTechnicianId,
  applyJobVisibilityToQueryBuilder,
  findJobForActor,
  requireJobListPermission,
} from "./jobs-access";

type RelatedValue<T> = T | T[] | null;

export type ListJobsFilters = {
  status?: string;
  technicianId?: string;
  excludeCancelled?: boolean;
  limit?: number;
};

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(JobEntity)
    private readonly jobsRepository: Repository<JobEntity>,
  ) {}

  private relationValue<T>(value: RelatedValue<T> | undefined) {
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return value ?? null;
  }

  normalizeJobDetail(job: JobEntity): JobEntity {
    if (job.notes) {
      job.notes = [...job.notes].sort(
        (left, right) =>
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
      );
    }

    if (job.status_events) {
      job.status_events = [...job.status_events].sort(
        (left, right) =>
          new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
      );
    }

    const quote = this.relationValue(job.quote as RelatedValue<QuoteEntity>);

    if (quote) {
      Object.assign(quote, {
        subtotal_cents: quote.subtotal_cents || quote.price_cents,
        tax_cents: quote.tax_cents ?? 0,
        total_cents: quote.total_cents || quote.price_cents,
      });
    }

    const invoice = this.relationValue(job.invoice as RelatedValue<InvoiceEntity>);

    if (invoice) {
      Object.assign(invoice, {
        subtotal_cents: invoice.subtotal_cents || invoice.amount_cents,
        tax_cents: invoice.tax_cents ?? 0,
        total_cents: invoice.total_cents || invoice.amount_cents,
      });
    }

    return job;
  }

  async listJobs(
    actor: ActorContext,
    organizationId: string,
    filters: ListJobsFilters = {},
  ): Promise<JobEntity[]> {
    requireJobListPermission(actor);

    const queryBuilder = this.jobsRepository
      .createQueryBuilder("job")
      .leftJoinAndSelect("job.customer", "customer")
      .leftJoinAndSelect("job.service", "service")
      .leftJoinAndSelect("job.technician", "technician")
      .leftJoinAndSelect("job.quote", "quote")
      .leftJoinAndSelect("job.invoice", "invoice")
      .orderBy("job.scheduled_for", "ASC")
      .addOrderBy("job.created_at", "DESC");

    applyJobVisibilityToQueryBuilder(queryBuilder, actor, organizationId);

    if (filters.status?.trim()) {
      queryBuilder.andWhere("job.status = :status", { status: filters.status.trim() });
    } else if (filters.excludeCancelled !== false) {
      queryBuilder.andWhere("job.status != :cancelled", { cancelled: "cancelled" });
    }

    if (filters.technicianId && actorCanFilterByTechnicianId(actor)) {
      queryBuilder.andWhere("job.assigned_technician_id = :technicianId", {
        technicianId: filters.technicianId,
      });
    }

    if (filters.limit && filters.limit > 0) {
      queryBuilder.take(filters.limit);
    }

    return queryBuilder.getMany();
  }

  async getJobDetail(
    actor: ActorContext,
    organizationId: string,
    jobId: string,
  ): Promise<JobEntity> {
    const job = await findJobForActor(this.jobsRepository, jobId, organizationId, actor);
    return this.normalizeJobDetail(job);
  }

  async loadJobDetailForOrganization(
    jobId: string,
    organizationId: string,
  ): Promise<JobEntity | null> {
    const job = await this.jobsRepository.findOne({
      where: {
        id: jobId,
        organization_id: organizationId,
      },
      relations: {
        customer: true,
        service: true,
        technician: true,
        quote: true,
        invoice: {
          payments: true,
        },
        notes: {
          author_profile: true,
        },
        status_events: true,
      },
    });

    if (!job) {
      return null;
    }

    return this.normalizeJobDetail(job);
  }
}
