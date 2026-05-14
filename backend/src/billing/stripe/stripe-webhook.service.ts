import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { apiError } from "../../common/api-response";
import type { ProviderSubscriptionItemSnapshot } from "../billing-provider.types";
import type { BillingPlanKey, OrganizationBillingStatus } from "../billing.constants";
import { BillingOrchestrationService } from "../billing-orchestration.service";
import { resolvePlanKeyForStripePriceId, resolveStripeSubscriptionCatalogEntry } from "./stripe-price-catalog";
import { StripeClient } from "./stripe.client";

type StripeMetadata = Partial<{
  billing_account_id: string;
  organization_id: string;
  allocated_organization_id: string;
  user_id: string;
  plan_key: string;
}>;

type StripeEventPayload = {
  type: string;
  data?: {
    object?: unknown;
  };
};

type StripeCheckoutSessionPayload = {
  metadata?: Record<string, string>;
  customer?: unknown;
  subscription?: unknown;
};

type StripeSubscriptionPayload = {
  id: string;
  status?: string;
  metadata?: Record<string, string>;
  customer?: unknown;
  current_period_start?: number | null;
  current_period_end?: number | null;
  cancel_at_period_end?: boolean;
  canceled_at?: number | null;
  ended_at?: number | null;
  items?: {
    data?: Array<{
      id?: string | null;
      quantity?: number | null;
      metadata?: Record<string, string> | null;
      price?: {
        id?: string | null;
      } | null;
    }>;
  };
};

type StripeInvoiceLinePayload = {
  period?: {
    start?: number | null;
    end?: number | null;
  } | null;
  pricing?: {
    price_details?: {
      price?: string | null;
    } | null;
  } | null;
  plan?: {
    id?: string | null;
  } | null;
};

type StripeInvoicePayload = {
  customer?: unknown;
  subscription?: unknown;
  last_finalization_error?: {
    message?: string | null;
  } | null;
  parent?: {
    subscription_details?: {
      metadata?: Record<string, string> | null;
    } | null;
  } | null;
  lines?: {
    data?: StripeInvoiceLinePayload[];
  };
};

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly stripeClient: StripeClient,
    private readonly billingOrchestrationService: BillingOrchestrationService,
  ) {}

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!rawBody?.length) {
      apiError(400, "stripe_webhook_raw_body_missing", "Stripe webhook raw body is missing.");
    }

    if (!signature?.trim()) {
      apiError(400, "stripe_webhook_signature_missing", "Stripe signature header is missing.");
    }

    let event: StripeEventPayload;
    try {
      event = this.stripeClient.constructWebhookEvent(rawBody, signature.trim()) as StripeEventPayload;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Stripe webhook signature verification failed.";
      apiError(400, "stripe_webhook_signature_invalid", message);
    }

    switch (event.type) {
      case "checkout.session.completed":
        await this.handleCheckoutSessionCompleted(event.data?.object as StripeCheckoutSessionPayload);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await this.handleSubscriptionUpsert(event.data?.object as StripeSubscriptionPayload);
        break;
      case "customer.subscription.deleted":
        await this.handleSubscriptionDeleted(event.data?.object as StripeSubscriptionPayload);
        break;
      case "invoice.paid":
        await this.handleInvoicePaid(event.data?.object as StripeInvoicePayload);
        break;
      case "invoice.payment_failed":
        await this.handleInvoicePaymentFailed(event.data?.object as StripeInvoicePayload);
        break;
      default:
        this.logger.debug(`Ignoring Stripe event ${event.type}`);
    }
  }

  private async handleCheckoutSessionCompleted(session: StripeCheckoutSessionPayload) {
    const metadata = readStripeMetadata(session.metadata);
    await this.billingOrchestrationService.applyProviderSnapshot({
      provider: "stripe",
      billingAccountId: metadata.billing_account_id ?? null,
      organizationId: metadata.organization_id ?? null,
      providerCustomerId: readStripeId(session.customer),
      providerSubscriptionId: readStripeId(session.subscription),
      planKey: parseMetadataPlanKey(metadata),
      attentionReason: null,
      lastProviderSyncAt: new Date(),
      lastWebhookAt: new Date(),
    });
  }

  private async handleSubscriptionUpsert(subscription: StripeSubscriptionPayload) {
    const priceId = readSubscriptionPriceId(subscription);
    const metadata = readStripeMetadata(subscription.metadata);
    const subscriptionItems = readSubscriptionItems(this.configService, subscription);
    await this.billingOrchestrationService.applyProviderSnapshot({
      provider: "stripe",
      billingAccountId: metadata.billing_account_id ?? null,
      organizationId: metadata.organization_id ?? null,
      providerCustomerId: readStripeId(subscription.customer),
      providerSubscriptionId: subscription.id,
      providerPriceId: priceId,
      subscriptionItems,
      planKey: parseMetadataPlanKey(metadata) ?? resolvePlanKeyForStripePriceId(this.configService, priceId),
      billingStatus: mapStripeSubscriptionStatus(subscription.status),
      currentPeriodStart: unixToDate(subscription.current_period_start),
      currentPeriodEnd: unixToDate(subscription.current_period_end),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: unixToDate(subscription.canceled_at),
      deactivatedAt: subscription.status === "canceled" ? unixToDate(subscription.ended_at) ?? new Date() : null,
      attentionReason: subscription.status === "past_due" || subscription.status === "unpaid"
        ? "Stripe reports the subscription as past due."
        : null,
      lastProviderSyncAt: new Date(),
      lastWebhookAt: new Date(),
    });
  }

  private async handleSubscriptionDeleted(subscription: StripeSubscriptionPayload) {
    const priceId = readSubscriptionPriceId(subscription);
    const metadata = readStripeMetadata(subscription.metadata);
    const subscriptionItems = readSubscriptionItems(this.configService, subscription);
    await this.billingOrchestrationService.applyProviderSnapshot({
      provider: "stripe",
      billingAccountId: metadata.billing_account_id ?? null,
      organizationId: metadata.organization_id ?? null,
      providerCustomerId: readStripeId(subscription.customer),
      providerSubscriptionId: subscription.id,
      providerPriceId: priceId,
      subscriptionItems,
      planKey: parseMetadataPlanKey(metadata) ?? resolvePlanKeyForStripePriceId(this.configService, priceId),
      billingStatus: "deactivated",
      cancelAtPeriodEnd: false,
      canceledAt: unixToDate(subscription.canceled_at) ?? new Date(),
      deactivatedAt: unixToDate(subscription.ended_at) ?? new Date(),
      attentionReason: null,
      lastProviderSyncAt: new Date(),
      lastWebhookAt: new Date(),
    });
  }

  private async handleInvoicePaid(invoice: StripeInvoicePayload) {
    const priceId = readInvoicePriceId(invoice);
    const metadata = readStripeMetadata(invoice.parent?.subscription_details?.metadata ?? null);
    await this.billingOrchestrationService.applyProviderSnapshot({
      provider: "stripe",
      billingAccountId: metadata.billing_account_id ?? null,
      organizationId: metadata.organization_id ?? null,
      providerCustomerId: readStripeId(invoice.customer),
      providerSubscriptionId: readStripeId(invoice.subscription),
      providerPriceId: priceId,
      planKey: parseMetadataPlanKey(metadata) ?? resolvePlanKeyForStripePriceId(this.configService, priceId),
      billingStatus: "active",
      currentPeriodStart: readInvoicePeriodStart(invoice),
      currentPeriodEnd: readInvoicePeriodEnd(invoice),
      attentionReason: null,
      lastProviderSyncAt: new Date(),
      lastWebhookAt: new Date(),
    });
  }

  private async handleInvoicePaymentFailed(invoice: StripeInvoicePayload) {
    const priceId = readInvoicePriceId(invoice);
    const metadata = readStripeMetadata(invoice.parent?.subscription_details?.metadata ?? null);
    await this.billingOrchestrationService.applyProviderSnapshot({
      provider: "stripe",
      billingAccountId: metadata.billing_account_id ?? null,
      organizationId: metadata.organization_id ?? null,
      providerCustomerId: readStripeId(invoice.customer),
      providerSubscriptionId: readStripeId(invoice.subscription),
      providerPriceId: priceId,
      planKey: parseMetadataPlanKey(metadata) ?? resolvePlanKeyForStripePriceId(this.configService, priceId),
      billingStatus: "past_due",
      attentionReason: invoice.last_finalization_error?.message ?? "Stripe reported an invoice payment failure.",
      lastProviderSyncAt: new Date(),
      lastWebhookAt: new Date(),
    });
  }
}

function mapStripeSubscriptionStatus(status: string | null | undefined): OrganizationBillingStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";
    case "canceled":
      return "canceled";
    case "incomplete_expired":
    case "paused":
    default:
      return "unknown";
  }
}

function readStripeMetadata(metadata: Record<string, string> | null | undefined): StripeMetadata {
  if (!metadata) {
    return {};
  }
  return metadata as StripeMetadata;
}

function parseMetadataPlanKey(metadata: StripeMetadata): BillingPlanKey | null {
  const planKey = metadata.plan_key?.trim().toLowerCase();
  if (planKey === "starter" || planKey === "pro" || planKey === "business") {
    return planKey;
  }
  return null;
}

function unixToDate(value: number | null | undefined) {
  return typeof value === "number" ? new Date(value * 1000) : null;
}

function readStripeId(value: unknown) {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && "id" in value && typeof value.id === "string") {
    return value.id;
  }
  return null;
}

function readSubscriptionPriceId(subscription: StripeSubscriptionPayload) {
  return subscription.items?.data?.[0]?.price?.id ?? null;
}

function readSubscriptionItems(
  configService: ConfigService,
  subscription: StripeSubscriptionPayload,
): ProviderSubscriptionItemSnapshot[] {
  const items = subscription.items?.data ?? [];

  const snapshots = items.map((item) => {
      const providerSubscriptionItemId = item.id?.trim();
      if (!providerSubscriptionItemId) {
        return null;
      }

      const providerPriceId = item.price?.id?.trim() ?? null;
      const resolved = resolveStripeSubscriptionCatalogEntry(configService, providerPriceId);
      if (!resolved) {
        return null;
      }

      return {
        providerSubscriptionItemId,
        providerPriceId,
        quantity: normalizeQuantity(item.quantity),
        allocatedOrganizationId: readStripeItemAllocatedOrganizationId(item.metadata),
      };
    }) as Array<ProviderSubscriptionItemSnapshot | null>;

  return snapshots.filter((item): item is ProviderSubscriptionItemSnapshot => Boolean(item));
}

function readInvoicePriceId(invoice: StripeInvoicePayload) {
  return invoice.lines?.data?.[0]?.pricing?.price_details?.price ?? invoice.lines?.data?.[0]?.plan?.id ?? null;
}

function normalizeQuantity(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.trunc(value);
}

function readStripeItemAllocatedOrganizationId(metadata: Record<string, string> | null | undefined) {
  const normalizedMetadata = readStripeMetadata(metadata);
  return normalizedMetadata.allocated_organization_id?.trim()
    ?? normalizedMetadata.organization_id?.trim()
    ?? null;
}

function readInvoicePeriodStart(invoice: StripeInvoicePayload) {
  const period = invoice.lines?.data?.[0]?.period;
  return period?.start ? new Date(period.start * 1000) : null;
}

function readInvoicePeriodEnd(invoice: StripeInvoicePayload) {
  const period = invoice.lines?.data?.[0]?.period;
  return period?.end ? new Date(period.end * 1000) : null;
}
