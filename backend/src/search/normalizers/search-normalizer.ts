import { Injectable } from "@nestjs/common";

import { getJobStatusLabel, type JobStatus } from "../../crm/constants";
import { SearchDestinationMap } from "../search.destination-map";
import type { CustomerSearchHit, JobSearchHit, SearchResultItem } from "../search.types";

@Injectable()
export class SearchNormalizer {
  constructor(private readonly destinationMap: SearchDestinationMap) {}

  toJobResults(rows: JobSearchHit[]): SearchResultItem[] {
    return rows.map((row) => ({
      id: row.id,
      entity: "jobs",
      title: row.title,
      subtitle: `${row.customerName} - ${row.addressLine1}`,
      status: getJobStatusLabel(row.status as JobStatus),
      destination: this.destinationMap.toJobDestination(row.id),
      updatedAt: row.updatedAt,
    }));
  }

  toCustomerResults(rows: CustomerSearchHit[]): SearchResultItem[] {
    return rows.map((row) => ({
      id: row.id,
      entity: "customers",
      title: row.fullName,
      subtitle: row.companyName ?? row.addressLine1,
      status: null,
      destination: this.destinationMap.toCustomerDestination(row.id),
      updatedAt: row.updatedAt,
    }));
  }
}
