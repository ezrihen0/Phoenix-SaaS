import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type CloverSubscriptionPayload = {
  id?: string;
  active?: boolean;
  customerId?: string;
  customerUuid?: string;
  plan?: { id?: string; name?: string };
  modifiedTime?: string;
  startDate?: string;
  object?: string;
};

const recurringUserAgent = "WizField-Billing/1.0";

@Injectable()
export class CloverRecurringClient {
  private readonly logger = new Logger(CloverRecurringClient.name);

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.merchantId()?.trim() && this.accessToken()?.trim());
  }

  async getSubscription(subscriptionId: string): Promise<CloverSubscriptionPayload | null> {
    const merchantId = this.merchantId();
    const token = this.accessToken();
    if (!merchantId?.trim() || !token?.trim()) {
      return null;
    }

    const base = this.apiBase();
    const url = `${base}/recurring/v1/subscriptions/${encodeURIComponent(subscriptionId)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${token.trim()}`,
        "X-Clover-Merchant-Id": merchantId.trim(),
        "User-Agent": recurringUserAgent,
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      this.logger.warn(`Clover GET subscription failed ${response.status}: ${text.slice(0, 200)}`);
      return null;
    }

    return (await response.json()) as CloverSubscriptionPayload;
  }

  async createSubscription(
    planId: string,
    body: { customerId: string; collectionMethod?: string },
  ): Promise<CloverSubscriptionPayload | null> {
    const merchantId = this.merchantId();
    const token = this.accessToken();
    if (!merchantId?.trim() || !token?.trim()) {
      return null;
    }

    const base = this.apiBase();
    const url = `${base}/recurring/v1/plans/${encodeURIComponent(planId)}/subscriptions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        Authorization: `Bearer ${token.trim()}`,
        "X-Clover-Merchant-Id": merchantId.trim(),
        "User-Agent": recurringUserAgent,
      },
      body: JSON.stringify({
        customerId: body.customerId.trim(),
        collectionMethod: body.collectionMethod ?? "CHARGE_AUTOMATICALLY",
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      this.logger.warn(`Clover POST subscription failed ${response.status}: ${text.slice(0, 400)}`);
      return null;
    }

    return (await response.json()) as CloverSubscriptionPayload;
  }

  async updateSubscription(
    subscriptionId: string,
    patch: { active?: boolean },
  ): Promise<CloverSubscriptionPayload | null> {
    const merchantId = this.merchantId();
    const token = this.accessToken();
    if (!merchantId?.trim() || !token?.trim()) {
      return null;
    }

    const base = this.apiBase();
    const url = `${base}/recurring/v1/subscriptions/${encodeURIComponent(subscriptionId)}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        Authorization: `Bearer ${token.trim()}`,
        "X-Clover-Merchant-Id": merchantId.trim(),
        "User-Agent": recurringUserAgent,
      },
      body: JSON.stringify(patch),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      this.logger.warn(`Clover PUT subscription failed ${response.status}: ${text.slice(0, 400)}`);
      return null;
    }

    return (await response.json()) as CloverSubscriptionPayload;
  }

  private apiBase(): string {
    return (
      this.configService.get<string>("CLOVER_API_BASE_URL")?.trim()
      ?? "https://apisandbox.dev.clover.com"
    ).replace(/\/$/, "");
  }

  private merchantId(): string | undefined {
    return this.configService.get<string>("CLOVER_MERCHANT_ID");
  }

  private accessToken(): string | undefined {
    return (
      this.configService.get<string>("CLOVER_ACCESS_TOKEN")
      ?? this.configService.get<string>("CLOVER_PRIVATE_TOKEN")
    );
  }
}
