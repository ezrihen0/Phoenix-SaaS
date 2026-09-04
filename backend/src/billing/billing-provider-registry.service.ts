import { Injectable } from "@nestjs/common";

import { apiError } from "../common/api-response";
import type { BillingProviderPort } from "./billing-provider.interface";

@Injectable()
export class BillingProviderRegistryService {
  getActiveProviderName(): null {
    return null;
  }

  isActiveProviderConfigured() {
    return false;
  }

  getActiveProvider(): BillingProviderPort {
    apiError(
      410,
      "platform_subscription_billing_disabled",
      "WizField SaaS subscription billing has no active provider in this runtime.",
    );
  }
}
