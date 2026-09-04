import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, Repository } from "typeorm";

import { CustomerEntity } from "../database/entities/customer.entity";
import { JobEntity } from "../database/entities/job.entity";
import { openJobStatuses } from "./constants";
import { sanitizeCustomerNotes, sanitizeJobTitle, sanitizeUserFacingText } from "./user-facing-text";

export type CustomerLedgerSegment = "all" | "company" | "individual";

export type CustomerLedgerQuery = {
  page?: string;
  pageSize?: string;
  q?: string;
  segment?: string;
  region?: string;
};

export type CustomerLedgerCityOption = {
  key: string;
  label: string;
  count: number;
};

export type CustomerLedgerAggregates = {
  totalCustomers: number;
  withOpenJobs: number;
  newThisMonth: number;
  relatedJobs: number;
};

export type CustomerLedgerListItem = CustomerEntity & {
  relatedJobs: JobEntity[];
};

export type CustomerLedgerResult = {
  items: CustomerLedgerListItem[];
  total: number;
  page: number;
  pageSize: number;
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  aggregates: CustomerLedgerAggregates;
  cityOptions: CustomerLedgerCityOption[];
};

const PAGE_SIZES = [10, 20, 24, 25, 50, 100] as const;

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeCityKey(city: string) {
  return city.trim().toLowerCase();
}

function parseSegment(value: string | undefined): CustomerLedgerSegment {
  if (value === "company" || value === "individual") {
    return value;
  }
  return "all";
}

function startOfLocalMonth(reference = new Date()) {
  const date = new Date(reference);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfNextLocalMonth(reference = new Date()) {
  const date = startOfLocalMonth(reference);
  date.setMonth(date.getMonth() + 1);
  return date;
}

function presentRelatedJob(job: JobEntity, customer: CustomerEntity): JobEntity {
  return Object.assign(job, {
    title: sanitizeJobTitle(job.title, {
      customerName: customer.full_name,
      serviceType: job.requested_service_type,
    }),
    description: sanitizeUserFacingText(job.description) || job.description,
  });
}

function presentCustomer(customer: CustomerEntity, relatedJobs: JobEntity[]): CustomerLedgerListItem {
  return Object.assign(customer, {
    notes: sanitizeCustomerNotes(customer.notes),
    relatedJobs,
  });
}

@Injectable()
export class CustomerLedgerService {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly customersRepository: Repository<CustomerEntity>,
    @InjectRepository(JobEntity)
    private readonly jobsRepository: Repository<JobEntity>,
  ) {}

  async listLedger(organizationId: string, query: CustomerLedgerQuery): Promise<CustomerLedgerResult> {
    const pageSizeValue = parsePositiveInt(query.pageSize, 50);
    const pageSize = PAGE_SIZES.includes(pageSizeValue as (typeof PAGE_SIZES)[number]) ? pageSizeValue : 50;
    const requestedPage = parsePositiveInt(query.page, 1);
    const search = (query.q ?? "").trim();
    const segment = parseSegment(query.segment);
    const regionKey = query.region ? normalizeCityKey(query.region) : "";

    const filteredQb = this.customersRepository
      .createQueryBuilder("customer")
      .where("customer.organization_id = :organizationId", { organizationId });
    this.applyFilters(filteredQb, { search, segment, regionKey });

    const cityQb = this.customersRepository
      .createQueryBuilder("customer")
      .where("customer.organization_id = :organizationId", { organizationId });
    this.applyFilters(cityQb, { search, segment, regionKey: "" });

    const [total, aggregates, cityOptions] = await Promise.all([
      filteredQb.clone().getCount(),
      this.getOrganizationAggregates(organizationId),
      this.loadCityOptions(cityQb),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);

    const rows = total === 0
      ? []
      : await filteredQb
        .clone()
        .orderBy("customer.updated_at", "DESC")
        .addOrderBy("customer.full_name", "ASC")
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .getMany();

    const customerIds = rows.map((customer) => customer.id);
    const jobs = customerIds.length === 0
      ? []
      : await this.jobsRepository
        .createQueryBuilder("job")
        .leftJoinAndSelect("job.technician", "technician")
        .where("job.organization_id = :organizationId", { organizationId })
        .andWhere("job.customer_id IN (:...customerIds)", { customerIds })
        .orderBy("job.scheduled_for", "ASC")
        .addOrderBy("job.updated_at", "DESC")
        .getMany();

    const jobsByCustomer = new Map<string, JobEntity[]>();
    for (const job of jobs) {
      const existing = jobsByCustomer.get(job.customer_id) ?? [];
      existing.push(job);
      jobsByCustomer.set(job.customer_id, existing);
    }

    const items = rows.map((customer) => {
      const relatedJobs = (jobsByCustomer.get(customer.id) ?? []).map((job) => presentRelatedJob(job, customer));
      return presentCustomer(customer, relatedJobs);
    });

    return {
      items,
      total,
      page,
      pageSize,
      pagination: {
        page,
        pageSize,
        totalCount: total,
        totalPages,
      },
      aggregates,
      cityOptions,
    };
  }

  async getOrganizationAggregates(organizationId: string): Promise<CustomerLedgerAggregates> {
    const monthStart = startOfLocalMonth();
    const nextMonthStart = startOfNextLocalMonth();

    const [totalCustomers, withOpenJobs, newThisMonth, relatedJobs] = await Promise.all([
      this.customersRepository.count({ where: { organization_id: organizationId } }),
      this.customersRepository
        .createQueryBuilder("customer")
        .innerJoin("customer.jobs", "job")
        .where("customer.organization_id = :organizationId", { organizationId })
        .andWhere("job.organization_id = :organizationId", { organizationId })
        .andWhere("job.status IN (:...openStatuses)", { openStatuses: openJobStatuses })
        .select("COUNT(DISTINCT customer.id)", "total")
        .getRawOne<{ total: string | number }>()
        .then((row) => Number(row?.total) || 0),
      this.customersRepository
        .createQueryBuilder("customer")
        .where("customer.organization_id = :organizationId", { organizationId })
        .andWhere("customer.created_at >= :monthStart", { monthStart })
        .andWhere("customer.created_at < :nextMonthStart", { nextMonthStart })
        .getCount(),
      this.jobsRepository.count({ where: { organization_id: organizationId } }),
    ]);

    return {
      totalCustomers,
      withOpenJobs,
      newThisMonth,
      relatedJobs,
    };
  }

  private applyFilters(
    qb: ReturnType<Repository<CustomerEntity>["createQueryBuilder"]>,
    filters: { search: string; segment: CustomerLedgerSegment; regionKey: string },
  ) {
    if (filters.search.length > 0) {
      qb.andWhere(new Brackets((where) => {
        where.where("LOWER(customer.full_name) LIKE :search", { search: `%${filters.search.toLowerCase()}%` })
          .orWhere("LOWER(COALESCE(customer.email, '')) LIKE :search", { search: `%${filters.search.toLowerCase()}%` })
          .orWhere("customer.phone LIKE :search", { search: `%${filters.search}%` })
          .orWhere("LOWER(COALESCE(customer.company_name, '')) LIKE :search", { search: `%${filters.search.toLowerCase()}%` })
          .orWhere("LOWER(customer.service_address_line_1) LIKE :search", { search: `%${filters.search.toLowerCase()}%` })
          .orWhere("LOWER(COALESCE(customer.service_address_line_2, '')) LIKE :search", { search: `%${filters.search.toLowerCase()}%` })
          .orWhere("LOWER(customer.service_city) LIKE :search", { search: `%${filters.search.toLowerCase()}%` })
          .orWhere("LOWER(COALESCE(customer.service_state_or_region, '')) LIKE :search", { search: `%${filters.search.toLowerCase()}%` })
          .orWhere("customer.service_postal_code LIKE :search", { search: `%${filters.search}%` })
          .orWhere("LOWER(COALESCE(customer.external_client_number, '')) LIKE :search", { search: `%${filters.search.toLowerCase()}%` });
      }));
    }

    if (filters.segment === "company") {
      qb.andWhere("TRIM(COALESCE(customer.company_name, '')) <> ''");
    } else if (filters.segment === "individual") {
      qb.andWhere("TRIM(COALESCE(customer.company_name, '')) = ''");
    }

    if (filters.regionKey) {
      qb.andWhere("LOWER(TRIM(customer.service_city)) = :regionKey", { regionKey: filters.regionKey });
    }
  }

  private async loadCityOptions(
    qb: ReturnType<Repository<CustomerEntity>["createQueryBuilder"]>,
  ): Promise<CustomerLedgerCityOption[]> {
    const rows = await qb
      .clone()
      .andWhere("TRIM(customer.service_city) <> ''")
      .select("LOWER(TRIM(customer.service_city))", "cityKey")
      .addSelect("MIN(customer.service_city)", "label")
      .addSelect("COUNT(*)", "count")
      .groupBy("LOWER(TRIM(customer.service_city))")
      .orderBy("label", "ASC")
      .getRawMany<{ cityKey: string; label: string; count: string | number }>();

    return rows.map((row) => ({
      key: row.cityKey,
      label: row.label,
      count: Number(row.count) || 0,
    }));
  }
}
