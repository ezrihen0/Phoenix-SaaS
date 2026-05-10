import { Injectable } from "@nestjs/common";

@Injectable()
export class SearchDestinationMap {
  toJobDestination(jobId: string) {
    return `/jobs/${jobId}`;
  }

  toCustomerDestination(customerId: string) {
    return `/customers/${customerId}`;
  }
}
