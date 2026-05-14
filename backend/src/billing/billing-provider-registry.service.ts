import { Injectable } from "@nestjs/common";

import type { BillingProviderPort } from "./billing-provider.interface";
import { StripeBillingProvider } from "./stripe/stripe-billing.provider";

@Injectable()
export class BillingProviderRegistryService {
  constructor(private readonly stripeBillingProvider: StripeBillingProvider) {}

  getActiveProvider(): BillingProviderPort {
    return this.stripeBillingProvider;
  }
}
