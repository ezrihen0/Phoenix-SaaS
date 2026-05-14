import type { BillingProvider } from "./billing.constants";
import type { BillingCheckoutSessionInput, BillingCheckoutSessionResult } from "./billing-provider.types";

export interface BillingProviderPort {
  readonly provider: BillingProvider;
  isConfigured(): boolean;
  createCheckoutSession(input: BillingCheckoutSessionInput): Promise<BillingCheckoutSessionResult>;
}
