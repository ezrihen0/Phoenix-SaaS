import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, Repository } from "typeorm";

import { CustomerEntity } from "../../database/entities/customer.entity";
import { JobEntity } from "../../database/entities/job.entity";
import { SEARCH_LIMITS } from "../search.constants";
import type { JobSearchHit, SearchQueryContext } from "../search.types";

@Injectable()
export class JobsSearchAdapter {
  constructor(
    @InjectRepository(JobEntity)
    private readonly jobsRepository: Repository<JobEntity>,
  ) {}

  async search(context: SearchQueryContext): Promise<JobSearchHit[]> {
    const qb = this.jobsRepository
      .createQueryBuilder("job")
      .leftJoin(CustomerEntity, "customer", "customer.id = job.customer_id")
      .select("job.id", "id")
      .addSelect("job.title", "title")
      .addSelect("job.status", "status")
      .addSelect("customer.full_name", "customerName")
      .addSelect("job.service_address_line_1", "addressLine1")
      .addSelect("job.service_city", "city")
      .addSelect("job.service_state_or_region", "stateOrRegion")
      .addSelect("job.service_postal_code", "postalCode")
      .addSelect("job.updated_at", "updatedAt")
      .orderBy("job.updated_at", "DESC")
      .limit(SEARCH_LIMITS.jobsCandidateLimit);

    qb.where(new Brackets((q) => {
      q.where("LOWER(job.id) = :exact", { exact: context.normalized })
        .orWhere("LOWER(job.title) LIKE :likeToken", { likeToken: context.likeToken })
        .orWhere("LOWER(customer.full_name) LIKE :likeToken", { likeToken: context.likeToken })
        .orWhere("LOWER(job.service_address_line_1) LIKE :likeToken", { likeToken: context.likeToken });
    }));

    const rawRows = await qb.getRawMany<{
      id: string;
      title: string;
      status: string;
      customerName: string;
      addressLine1: string;
      city: string;
      stateOrRegion: string | null;
      postalCode: string;
      updatedAt: Date;
    }>();

    return rawRows.slice(0, SEARCH_LIMITS.jobsResultLimit).map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      customerName: row.customerName ?? "Customer",
      addressLine1: row.addressLine1,
      city: row.city,
      stateOrRegion: row.stateOrRegion,
      postalCode: row.postalCode,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : new Date(row.updatedAt).toISOString(),
    }));
  }
}
