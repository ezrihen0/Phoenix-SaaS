import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, Repository } from "typeorm";

import { CustomerEntity } from "../../database/entities/customer.entity";
import { SEARCH_LIMITS } from "../search.constants";
import type { CustomerSearchHit, SearchQueryContext } from "../search.types";

@Injectable()
export class CustomersSearchAdapter {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly customersRepository: Repository<CustomerEntity>,
  ) {}

  async search(context: SearchQueryContext): Promise<CustomerSearchHit[]> {
    const qb = this.customersRepository
      .createQueryBuilder("customer")
      .select("customer.id", "id")
      .addSelect("customer.full_name", "fullName")
      .addSelect("customer.email", "email")
      .addSelect("customer.phone", "phone")
      .addSelect("customer.company_name", "companyName")
      .addSelect("customer.service_address_line_1", "addressLine1")
      .addSelect("customer.service_city", "city")
      .addSelect("customer.service_state_or_region", "stateOrRegion")
      .addSelect("customer.service_postal_code", "postalCode")
      .addSelect("customer.updated_at", "updatedAt")
      .orderBy("customer.updated_at", "DESC")
      .limit(SEARCH_LIMITS.customersCandidateLimit);

    qb.where(new Brackets((q) => {
      q.where("LOWER(customer.id) = :exact", { exact: context.normalized })
        .orWhere("LOWER(customer.full_name) LIKE :likeToken", { likeToken: context.likeToken })
        .orWhere("LOWER(customer.email) LIKE :likeToken", { likeToken: context.likeToken })
        .orWhere("customer.phone LIKE :digitsLike", { digitsLike: `%${context.digits}%` })
        .orWhere("LOWER(customer.external_client_number) LIKE :likeToken", { likeToken: context.likeToken });
    }));

    const rawRows = await qb.getRawMany<{
      id: string;
      fullName: string;
      email: string | null;
      phone: string;
      companyName: string | null;
      addressLine1: string;
      city: string;
      stateOrRegion: string | null;
      postalCode: string;
      updatedAt: Date;
    }>();

    return rawRows.slice(0, SEARCH_LIMITS.customersResultLimit).map((row) => ({
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      companyName: row.companyName,
      addressLine1: row.addressLine1,
      city: row.city,
      stateOrRegion: row.stateOrRegion,
      postalCode: row.postalCode,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : new Date(row.updatedAt).toISOString(),
    }));
  }
}
