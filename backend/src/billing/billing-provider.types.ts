import type { BillingProvider, OrganizationBillingStatus, PhoenixPlanKey } from "./billing.constants";

export type BillingCheckoutSessionInput = {
  billingAccountId: string;
  organizationId: string;
  userId: string;
  userEmail: string | null;
  planKey: PhoenixPlanKey;
  existingProviderCustomerId: string | null;
  successUrl: string;
  cancelUrl: string;
};

export type BillingCheckoutSessionResult = {
  provider: BillingProvider;
  sessionId: string;
  checkoutUrl: string;
};

export type ProviderSubscriptionSnapshot = {
  provider: BillingProvider;
  billingAccountId?: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  providerPriceId?: string | null;
  planKey?: PhoenixPlanKey | null;
  billingStatus?: OrganizationBillingStatus | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean | null;
  canceledAt?: Date | null;
  deactivatedAt?: Date | null;
  attentionReason?: string | null;
  lastProviderSyncAt?: Date | null;
  lastWebhookAt?: Date | null;
};
